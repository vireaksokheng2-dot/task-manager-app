<?php

namespace Tests\Feature;

use App\Models\ChecklistItem;
use App\Models\Label;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecurrenceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-03-10 12:00:00');
        $this->user = User::factory()->create(['timezone' => 'UTC']);
        Sanctum::actingAs($this->user);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function complete(Task $task): TestResponse
    {
        return $this->patchJson("/api/tasks/{$task->id}", ['status' => 'done']);
    }

    public function test_completing_a_daily_task_spawns_the_next_one(): void
    {
        $task = Task::factory()->for($this->user)->create([
            'title' => 'Standup', 'recurrence' => 'daily', 'priority' => 'high',
            'due_at' => '2026-03-10 15:00:00',
        ]);

        $res = $this->complete($task)->assertOk()
            ->assertJsonPath('data.status', 'done')
            ->assertJsonPath('spawned.title', 'Standup')
            ->assertJsonPath('spawned.status', 'todo')
            ->assertJsonPath('spawned.priority', 'high')
            ->assertJsonPath('spawned.recurrence', 'daily');

        $this->assertSame('2026-03-11T15:00:00+00:00', $res->json('spawned.due_at'));
        $this->assertSame(2, Task::count());
    }

    public function test_non_recurring_tasks_do_not_spawn(): void
    {
        $task = Task::factory()->for($this->user)->create();

        $this->complete($task)->assertOk()->assertJsonPath('spawned', null);
        $this->assertSame(1, Task::count());
    }

    public function test_overdue_recurring_task_rolls_forward_to_the_future(): void
    {
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'daily', 'due_at' => '2026-03-01 09:00:00']);

        $res = $this->complete($task)->assertOk();

        $this->assertSame('2026-03-11T09:00:00+00:00', $res->json('spawned.due_at'));
    }

    public function test_weekly_keeps_the_reminder_offset(): void
    {
        $task = Task::factory()->for($this->user)->create([
            'recurrence' => 'weekly', 'due_at' => '2026-03-12 09:00:00', 'remind_at' => '2026-03-12 08:00:00',
        ]);

        $res = $this->complete($task)->assertOk();

        $this->assertSame('2026-03-19T09:00:00+00:00', $res->json('spawned.due_at'));
        $this->assertSame('2026-03-19T08:00:00+00:00', $res->json('spawned.remind_at'));
        $this->assertNull($res->json('spawned.reminded_at'));
    }

    public function test_monthly_does_not_overflow_short_months(): void
    {
        Carbon::setTestNow('2026-01-31 06:00:00');
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'monthly', 'due_at' => '2026-01-31 09:00:00']);

        $this->assertSame('2026-02-28T09:00:00+00:00', $this->complete($task)->json('spawned.due_at'));
    }

    public function test_monthly_returns_to_the_original_day_after_a_short_month(): void
    {
        // Rolling forward 2 periods from Jan 31 must give Mar 31 (not Mar 28).
        Carbon::setTestNow('2026-02-28 12:00:00');
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'monthly', 'due_at' => '2026-01-31 09:00:00']);

        $this->assertSame('2026-03-31T09:00:00+00:00', $this->complete($task)->json('spawned.due_at'));
    }

    public function test_daily_keeps_local_wall_clock_time_across_dst(): void
    {
        // US DST starts 2026-03-08. 09:00 EST (14:00 UTC) tomorrow is 09:00 EDT (13:00 UTC).
        Carbon::setTestNow('2026-03-07 10:00:00');
        $this->user->update(['timezone' => 'America/New_York']);
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'daily', 'due_at' => '2026-03-07 14:00:00']);

        $this->assertSame('2026-03-08T13:00:00+00:00', $this->complete($task)->json('spawned.due_at'));
    }

    public function test_recurring_without_dates_spawns_a_dateless_copy(): void
    {
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'daily']);

        $this->complete($task)->assertJsonPath('spawned.due_at', null)->assertJsonPath('spawned.remind_at', null);
    }

    public function test_reopening_and_completing_again_does_not_duplicate(): void
    {
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'daily', 'due_at' => '2026-03-10 15:00:00']);

        $this->complete($task);
        $this->patchJson("/api/tasks/{$task->id}", ['status' => 'todo']);
        $this->complete($task)->assertJsonPath('spawned', null);

        $this->assertSame(2, Task::count());
    }

    public function test_editing_an_already_done_task_does_not_spawn(): void
    {
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'daily', 'status' => 'done']);

        $this->patchJson("/api/tasks/{$task->id}", ['title' => 'tweak'])->assertJsonPath('spawned', null);

        $this->assertSame(1, Task::count());
    }

    public function test_dragging_to_done_spawns_too(): void
    {
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'daily', 'due_at' => '2026-03-10 15:00:00']);

        $this->postJson("/api/tasks/{$task->id}/move", ['status' => 'done', 'position' => 0])->assertOk()->assertJsonCount(2, 'data');

        $this->assertSame(2, Task::count());
    }

    public function test_the_copy_inherits_labels_and_a_reset_checklist(): void
    {
        $label = Label::factory()->for($this->user)->create();
        $task = Task::factory()->for($this->user)->create(['recurrence' => 'weekly']);
        $task->labels()->attach($label);
        ChecklistItem::factory()->for($task)->create(['title' => 'Step', 'is_done' => true]);

        $res = $this->complete($task)->assertOk();

        $res->assertJsonPath('spawned.labels.0.id', $label->id)
            ->assertJsonPath('spawned.checklist.0.title', 'Step')
            ->assertJsonPath('spawned.checklist.0.is_done', false);
        $this->assertTrue($task->checklistItems()->first()->is_done, 'the completed original stays untouched');
    }
}
