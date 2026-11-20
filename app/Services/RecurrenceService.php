<?php

namespace App\Services;

use App\Enums\Recurrence;
use App\Enums\TaskStatus;
use App\Models\Task;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class RecurrenceService
{
    /**
     * Create the next occurrence of a recurring task that was just completed.
     *
     * Call this only on a transition into "done". It is idempotent: the
     * `recurred_at` claim guarantees one follow-up task per completion, even if
     * the task is reopened and completed again or two requests race.
     */
    public function spawnNext(Task $task): ?Task
    {
        if ($task->status !== TaskStatus::Done || $task->recurrence === Recurrence::None) {
            return null;
        }

        return DB::transaction(function () use ($task) {
            $claimed = Task::whereKey($task->id)->whereNull('recurred_at')->update(['recurred_at' => now()]);

            if (! $claimed) {
                return null;
            }

            $task->recurred_at = now();
            $tz = $task->user->timezone ?: 'UTC';

            // Roll forward from the original due date (or reminder) to the first
            // occurrence in the future, so an overdue task doesn't spawn an overdue copy.
            $base = $task->due_at ?? $task->remind_at;
            $steps = 1;

            if ($base) {
                while ($this->advance($base, $task->recurrence, $steps, $tz)->lte(now()) && $steps < 5000) {
                    $steps++;
                }
            }

            $next = $task->replicate(['status', 'completed_at', 'reminded_at', 'recurred_at', 'position']);
            $next->user_id = $task->user_id;
            $next->status = TaskStatus::Todo;
            $next->due_at = $task->due_at ? $this->advance($task->due_at, $task->recurrence, $steps, $tz) : null;
            $next->remind_at = $task->remind_at ? $this->advance($task->remind_at, $task->recurrence, $steps, $tz) : null;
            $next->position = (int) Task::where('user_id', $task->user_id)->where('status', TaskStatus::Todo->value)->max('position') + 1;
            $next->save();

            $next->labels()->sync($task->labels()->pluck('labels.id'));

            foreach ($task->checklistItems as $item) {
                $next->checklistItems()->create([
                    'title' => $item->title,
                    'is_done' => false,
                    'position' => $item->position,
                ]);
            }

            return $next;
        });
    }

    /** Shift a date by N recurrence periods, keeping the user's local wall-clock time across DST. */
    private function advance(CarbonInterface $date, Recurrence $recurrence, int $steps, string $timezone): CarbonInterface
    {
        $local = $date->copy()->setTimezone($timezone);

        $shifted = match ($recurrence) {
            Recurrence::Daily => $local->addDays($steps),
            Recurrence::Weekly => $local->addWeeks($steps),
            Recurrence::Monthly => $local->addMonthsNoOverflow($steps),
            Recurrence::None => $local,
        };

        return $shifted->utc();
    }
}
