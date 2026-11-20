<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    public function test_create_task_with_defaults(): void
    {
        $this->postJson('/api/tasks', ['title' => 'Write tests'])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Write tests')
            ->assertJsonPath('data.status', 'todo')
            ->assertJsonPath('data.priority', 'medium');
    }

    public function test_create_validates(): void
    {
        $this->postJson('/api/tasks', ['title' => '', 'status' => 'nope', 'priority' => 'x', 'due_at' => 'garbage'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'status', 'priority', 'due_at']);
    }

    public function test_list_only_returns_own_tasks_and_filters(): void
    {
        Task::factory()->for($this->user)->create(['title' => 'Buy Milk', 'priority' => 'low']);
        Task::factory()->for($this->user)->create(['title' => 'Ship release', 'priority' => 'urgent', 'description' => 'milk-free']);
        Task::factory()->create(['title' => 'Someone else']);

        $this->getJson('/api/tasks')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/tasks?priority=urgent')->assertJsonCount(1, 'data');
        $this->getJson('/api/tasks?search=MILK')->assertJsonCount(2, 'data');
        $this->getJson('/api/tasks?search=%25')->assertJsonCount(0, 'data');
    }

    public function test_overdue_filter(): void
    {
        Task::factory()->for($this->user)->create(['due_at' => now()->subDay()]);
        Task::factory()->for($this->user)->create(['due_at' => now()->subDay(), 'status' => 'done']);
        Task::factory()->for($this->user)->create(['due_at' => now()->addDay()]);

        $this->getJson('/api/tasks?overdue=1')->assertJsonCount(1, 'data');
    }

    public function test_cannot_touch_other_users_tasks(): void
    {
        $other = Task::factory()->create();

        $this->getJson("/api/tasks/{$other->id}")->assertNotFound();
        $this->putJson("/api/tasks/{$other->id}", ['title' => 'hax'])->assertNotFound();
        $this->postJson("/api/tasks/{$other->id}/move", ['status' => 'done', 'position' => 0])->assertNotFound();
        $this->deleteJson("/api/tasks/{$other->id}")->assertNotFound();
        $this->assertDatabaseHas('tasks', ['id' => $other->id, 'title' => $other->title]);
    }

    public function test_update_status_tracks_completed_at(): void
    {
        $task = Task::factory()->for($this->user)->create();

        $this->putJson("/api/tasks/{$task->id}", ['status' => 'done'])
            ->assertOk()->assertJsonPath('data.status', 'done');
        $this->assertNotNull($task->refresh()->completed_at);

        $this->putJson("/api/tasks/{$task->id}", ['status' => 'in_progress'])->assertOk();
        $this->assertNull($task->refresh()->completed_at);
    }

    public function test_partial_update_keeps_other_fields(): void
    {
        $task = Task::factory()->for($this->user)->create(['title' => 'Keep', 'priority' => 'high']);

        $this->patchJson("/api/tasks/{$task->id}", ['description' => 'new'])->assertOk();

        $task->refresh();
        $this->assertSame('Keep', $task->title);
        $this->assertSame('high', $task->priority->value);
        $this->assertSame('new', $task->description);
    }

    public function test_delete(): void
    {
        $task = Task::factory()->for($this->user)->create();

        $this->deleteJson("/api/tasks/{$task->id}")->assertNoContent();
        $this->assertSoftDeleted($task);
    }

    public function test_move_reorders_columns(): void
    {
        $a = Task::factory()->for($this->user)->create(['status' => 'todo', 'position' => 0]);
        $b = Task::factory()->for($this->user)->create(['status' => 'todo', 'position' => 1]);
        $c = Task::factory()->for($this->user)->create(['status' => 'in_progress', 'position' => 0]);

        // Move a into in_progress at the top.
        $this->postJson("/api/tasks/{$a->id}/move", ['status' => 'in_progress', 'position' => 0])->assertOk();

        $this->assertSame('in_progress', $a->refresh()->status->value);
        $this->assertSame(0, $a->position);
        $this->assertSame(1, $c->refresh()->position);
        $this->assertSame('todo', $b->refresh()->status->value);

        // Position past the end clamps.
        $this->postJson("/api/tasks/{$a->id}/move", ['status' => 'in_progress', 'position' => 99])->assertOk();
        $this->assertSame(1, $a->refresh()->position);
        $this->assertSame(0, $c->refresh()->position);
    }
}
