<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Notifications\TaskReminder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('tasks:send-reminders')]
#[Description('Notify users about tasks whose reminder time has arrived')]
class SendTaskReminders extends Command
{
    public function handle(): int
    {
        $sent = 0;

        Task::reminderDue()->with('user')->chunkById(100, function ($tasks) use (&$sent) {
            foreach ($tasks as $task) {
                // Atomically claim the reminder so overlapping runs never double-send.
                $claimed = Task::reminderDue()->whereKey($task->id)->update(['reminded_at' => now()]);

                if ($claimed) {
                    $task->user->notify(new TaskReminder($task));
                    $sent++;
                }
            }
        });

        $this->info("Sent {$sent} reminder(s).");

        return self::SUCCESS;
    }
}
