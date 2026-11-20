<?php

namespace App\Models;

use App\Enums\Recurrence;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Notifications\TaskReminder;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory, MassPrunable, SoftDeletes;

    protected $fillable = [
        'title', 'description', 'status', 'priority', 'recurrence',
        'due_at', 'remind_at', 'position',
    ];

    protected function casts(): array
    {
        return [
            'status' => TaskStatus::class,
            'priority' => TaskPriority::class,
            'recurrence' => Recurrence::class,
            'due_at' => 'datetime',
            'remind_at' => 'datetime',
            'reminded_at' => 'datetime',
            'completed_at' => 'datetime',
            'recurred_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Task $task) {
            // Keep completed_at in sync with status.
            if ($task->isDirty('status')) {
                $task->completed_at = $task->status === TaskStatus::Done ? now() : null;
            }

            // A new reminder time re-arms the reminder.
            if ($task->isDirty('remind_at')) {
                $task->reminded_at = null;
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class)->orderBy('labels.name');
    }

    public function checklistItems(): HasMany
    {
        return $this->hasMany(ChecklistItem::class)->orderBy('position')->orderBy('id');
    }

    /** Marks this task's unread reminder notifications as read (e.g. after a snooze). */
    public function clearUnreadReminders(): void
    {
        $this->user->unreadNotifications()
            ->where('type', TaskReminder::class)
            ->get()
            ->filter(fn ($n) => ($n->data['task_id'] ?? null) === $this->id)
            ->each->markAsRead();
    }

    /** Soft-deleted tasks are purged for good after 30 days (see `model:prune` in routes/console.php). */
    public function prunable(): Builder
    {
        return static::onlyTrashed()->where('deleted_at', '<=', now()->subDays(30));
    }

    /** Tasks whose reminder is due and has not been sent yet. */
    public function scopeReminderDue(Builder $query): Builder
    {
        return $query
            ->whereNotNull('remind_at')
            ->whereNull('reminded_at')
            ->where('remind_at', '<=', now())
            ->where('status', '!=', TaskStatus::Done->value);
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->where('status', '!=', TaskStatus::Done->value);
    }
}
