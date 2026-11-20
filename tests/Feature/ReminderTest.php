<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskReminder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReminderTest extends TestCase
{
    use RefreshDatabase;

    public function test_due_reminders_are_sent_once(): void
    {
        Notification::fake();
        $task = Task::factory()->create(['remind_at' => now()->subMinute()]);

        $this->artisan('tasks:send-reminders')->assertSuccessful();
        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertSentToTimes($task->user, TaskReminder::class, 1);
        $this->assertNotNull($task->refresh()->reminded_at);
    }

    public function test_future_done_and_unset_reminders_are_skipped(): void
    {
        Notification::fake();
        Task::factory()->create(['remind_at' => now()->addHour()]);
        Task::factory()->create(['remind_at' => now()->subMinute(), 'status' => 'done']);
        Task::factory()->create(['remind_at' => null]);

        $this->artisan('tasks:send-reminders')->assertSuccessful();

        Notification::assertNothingSent();
    }

    public function test_changing_remind_at_rearms_reminder(): void
    {
        Notification::fake();
        $task = Task::factory()->create(['remind_at' => now()->subMinute()]);
        $this->artisan('tasks:send-reminders');

        $task->refresh()->update(['remind_at' => now()->subSeconds(30)]);
        $this->artisan('tasks:send-reminders');

        Notification::assertSentToTimes($task->user, TaskReminder::class, 2);
    }

    public function test_reminder_shows_up_in_notification_api_and_can_be_read(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create(['title' => 'Call mom', 'remind_at' => now()->subMinute()]);
        $this->artisan('tasks:send-reminders');

        Sanctum::actingAs($user);
        $res = $this->getJson('/api/notifications')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.task_id', $task->id)
            ->assertJsonPath('data.0.message', 'Reminder: Call mom');

        $this->postJson('/api/notifications/'.$res->json('data.0.id').'/read')->assertNoContent();
        $this->getJson('/api/notifications')->assertJsonCount(0, 'data');
    }

    public function test_cannot_read_other_users_notification(): void
    {
        $task = Task::factory()->create(['remind_at' => now()->subMinute()]);
        $this->artisan('tasks:send-reminders');
        $id = $task->user->notifications()->first()->id;

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/notifications/{$id}/read")->assertNotFound();
    }

    public function test_notifications_include_a_task_summary_and_hide_stale_ones(): void
    {
        $user = User::factory()->create();
        $live = Task::factory()->for($user)->create(['title' => 'Live', 'priority' => 'high', 'remind_at' => now()->subMinute(), 'due_at' => now()->addHour()]);
        $finished = Task::factory()->for($user)->create(['title' => 'Finished', 'remind_at' => now()->subMinute()]);
        $deleted = Task::factory()->for($user)->create(['title' => 'Deleted', 'remind_at' => now()->subMinute()]);
        $this->artisan('tasks:send-reminders');

        $finished->update(['status' => 'done']);
        $deleted->delete();

        Sanctum::actingAs($user);
        $this->getJson('/api/notifications')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.task_id', $live->id)
            ->assertJsonPath('data.0.task.title', 'Live')
            ->assertJsonPath('data.0.task.priority', 'high');
    }

    public function test_snooze_rearms_the_reminder_and_clears_the_unread_one(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create(['remind_at' => now()->subMinute()]);
        $this->artisan('tasks:send-reminders');
        Notification::assertSentToTimes($user, TaskReminder::class, 1);
        $this->assertNotNull($task->refresh()->reminded_at);

        Sanctum::actingAs($user);
        $until = now()->addHour()->startOfSecond();
        $this->postJson("/api/tasks/{$task->id}/snooze", ['until' => $until->toIso8601String()])
            ->assertOk()
            ->assertJsonPath('data.reminded_at', null)
            ->assertJsonPath('data.remind_at', $until->toIso8601String());

        $this->artisan('tasks:send-reminders'); // not due yet
        Notification::assertSentToTimes($user, TaskReminder::class, 1);

        $this->travelTo($until->addMinute());
        $this->artisan('tasks:send-reminders'); // due again
        Notification::assertSentToTimes($user, TaskReminder::class, 2);
    }

    public function test_snooze_marks_the_tasks_unread_reminders_read(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create(['remind_at' => now()->subMinute()]);
        $other = Task::factory()->for($user)->create(['remind_at' => now()->subMinute()]);
        $this->artisan('tasks:send-reminders');

        Sanctum::actingAs($user);
        $this->postJson("/api/tasks/{$task->id}/snooze", ['until' => now()->addHour()->toIso8601String()])->assertOk();

        $this->getJson('/api/notifications')->assertJsonCount(1, 'data')->assertJsonPath('data.0.task_id', $other->id);
    }

    public function test_snooze_validates_the_time_and_the_task(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create();
        $done = Task::factory()->for($user)->create(['status' => 'done']);
        $foreign = Task::factory()->create();
        Sanctum::actingAs($user);

        $future = now()->addHour()->toIso8601String();
        $this->postJson("/api/tasks/{$task->id}/snooze", [])->assertUnprocessable()->assertJsonValidationErrors('until');
        $this->postJson("/api/tasks/{$task->id}/snooze", ['until' => now()->subMinute()->toIso8601String()])->assertUnprocessable();
        $this->postJson("/api/tasks/{$task->id}/snooze", ['until' => now()->addYears(2)->toIso8601String()])->assertUnprocessable();
        $this->postJson("/api/tasks/{$done->id}/snooze", ['until' => $future])->assertUnprocessable();
        $this->postJson("/api/tasks/{$foreign->id}/snooze", ['until' => $future])->assertNotFound();
    }
}
