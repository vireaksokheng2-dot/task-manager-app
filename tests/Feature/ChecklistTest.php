<?php

namespace Tests\Feature;

use App\Models\ChecklistItem;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChecklistTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    public function test_create_task_with_checklist(): void
    {
        $this->postJson('/api/tasks', [
            'title' => 'Trip',
            'checklist' => [['title' => 'Passport'], ['title' => 'Tickets', 'is_done' => true]],
        ])->assertCreated()
            ->assertJsonCount(2, 'data.checklist')
            ->assertJsonPath('data.checklist.0.title', 'Passport')
            ->assertJsonPath('data.checklist.0.is_done', false)
            ->assertJsonPath('data.checklist.1.is_done', true);
    }

    public function test_update_syncs_edits_additions_removals_and_order(): void
    {
        $task = Task::factory()->for($this->user)->create();
        $keep = ChecklistItem::factory()->for($task)->create(['title' => 'keep', 'position' => 0]);
        $drop = ChecklistItem::factory()->for($task)->create(['title' => 'drop', 'position' => 1]);

        $res = $this->patchJson("/api/tasks/{$task->id}", ['checklist' => [
            ['title' => 'brand new'],
            ['id' => $keep->id, 'title' => 'kept & renamed', 'is_done' => true],
        ]])->assertOk();

        $titles = collect($res->json('data.checklist'))->pluck('title')->all();
        $this->assertSame(['brand new', 'kept & renamed'], $titles);
        $this->assertSame($keep->id, $res->json('data.checklist.1.id'));
        $this->assertTrue($res->json('data.checklist.1.is_done'));
        $this->assertModelMissing($drop);
    }

    public function test_omitting_checklist_keeps_it_and_empty_array_clears_it(): void
    {
        $task = Task::factory()->for($this->user)->create();
        ChecklistItem::factory()->for($task)->count(2)->create();

        $this->patchJson("/api/tasks/{$task->id}", ['title' => 'renamed'])->assertJsonCount(2, 'data.checklist');
        $this->patchJson("/api/tasks/{$task->id}", ['checklist' => []])->assertJsonCount(0, 'data.checklist');
    }

    public function test_foreign_item_ids_are_not_hijacked(): void
    {
        $mine = Task::factory()->for($this->user)->create();
        $theirs = ChecklistItem::factory()->create(['title' => 'secret']);

        $this->patchJson("/api/tasks/{$mine->id}", ['checklist' => [['id' => $theirs->id, 'title' => 'stolen']]])
            ->assertOk()->assertJsonCount(1, 'data.checklist');

        $this->assertSame('secret', $theirs->refresh()->title);
        $this->assertNotSame($theirs->id, $mine->checklistItems()->first()->id);
    }

    public function test_checklist_validation(): void
    {
        $this->postJson('/api/tasks', ['title' => 'x', 'checklist' => [['title' => '']]])
            ->assertJsonValidationErrors('checklist.0.title');
        $this->postJson('/api/tasks', ['title' => 'x', 'checklist' => array_fill(0, 51, ['title' => 'i'])])
            ->assertJsonValidationErrors('checklist');
    }

    public function test_listing_does_not_n_plus_one(): void
    {
        Task::factory()->for($this->user)->count(8)->create()
            ->each(fn ($t) => ChecklistItem::factory()->for($t)->count(3)->create());

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->getJson('/api/tasks')->assertOk()->assertJsonCount(8, 'data');

        $this->assertLessThanOrEqual(6, $queries, "Too many queries ({$queries}) listing tasks");
    }
}
