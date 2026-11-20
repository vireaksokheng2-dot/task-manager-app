<?php

namespace App\Notifications;

use App\Models\Task;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskReminder extends Notification
{
    public function __construct(public Task $task) {}

    public function via(object $notifiable): array
    {
        return $notifiable->email_reminders ? ['database', 'mail'] : ['database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject("Reminder: {$this->task->title}")
            ->greeting("Hi {$notifiable->name},")
            ->line("This is your reminder for “{$this->task->title}”.");

        if ($this->task->due_at) {
            $due = $this->task->due_at->copy()->setTimezone($notifiable->timezone ?: 'UTC');
            $mail->line('Due: '.$due->isoFormat('dddd, MMM D [at] h:mm A').' ('.$due->getTimezone()->getName().')');
        }

        return $mail->action('Open Taskly', config('app.url'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'task_reminder',
            'task_id' => $this->task->id,
            'message' => "Reminder: {$this->task->title}",
        ];
    }
}
