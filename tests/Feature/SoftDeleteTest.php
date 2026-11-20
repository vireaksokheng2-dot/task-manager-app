<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SoftDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    public function test_deleted_tasks_leave_the_list_and_can_be_restored(): void
    {
        $task = Task::factory()->for($this->user)->create(['title' => 'Oops', 'status' => 'in_progress']);

        $this->deleteJson("/api/tasks/{$task->id}")->assertNoContent();
        $this->getJson('/api/tasks')->assertJsonCount(0, 'data');
        $this->getJson("/api/tasks/{$task->id}")->assertNotFound();

        $this->postJson("/api/tasks/{$task->id}/restore")
            ->assertOk()->assertJsonPath('data.title', 'Oops')->assertJsonPath('data.status', 'in_progress');
        $this->getJson('/api/tasks')->assertJsonCount(1, 'data');
    }

    public function test_restoring_a_live_or_foreign_task_404s(): void
    {
        $live = Task::factory()->for($this->user)->create();
        $foreign = Task::factory()->create();
        $foreign->delete();

        $this->postJson("/api/tasks/{$live->id}/restore")->assertNotFound();
        $this->postJson("/api/tasks/{$foreign->id}/restore")->assertNotFound();
    }

    public function test_deleted_tasks_do_not_trigger_reminders(): void
    {
        $task = Task::factory()->for($this->user)->create(['remind_at' => now()->subMinute()]);
        $task->delete();

        $this->artisan('tasks:send-reminders')->expectsOutput('Sent 0 reminder(s).');
    }

    public function test_old_trash_is_pruned_and_recent_trash_kept(): void
    {
        $old = Task::factory()->for($this->user)->create();
        $recent = Task::factory()->for($this->user)->create();
        $live = Task::factory()->for($this->user)->create();
        $old->delete();
        $recent->delete();
        Task::withTrashed()->whereKey($old->id)->update(['deleted_at' => now()->subDays(31)]);

        $this->artisan('model:prune', ['--model' => Task::class])->assertSuccessful();

        $this->assertDatabaseMissing('tasks', ['id' => $old->id]);
        $this->assertSoftDeleted($recent);
        $this->assertModelExists($live);
    }
}
