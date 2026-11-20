<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\MoveTaskRequest;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\RecurrenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    private const RELATIONS = ['labels', 'checklistItems'];

    public function __construct(private RecurrenceService $recurrence) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'status' => ['nullable', Rule::enum(TaskStatus::class)],
            'priority' => ['nullable', Rule::enum(TaskPriority::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'overdue' => ['nullable', 'boolean'],
            'label_id' => ['nullable', 'integer'],
        ]);

        $tasks = $request->user()->tasks()
            ->with(self::RELATIONS)
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['priority'] ?? null, fn ($q, $v) => $q->where('priority', $v))
            ->when($filters['label_id'] ?? null, fn ($q, $v) => $q->whereHas('labels', fn ($l) => $l->where('labels.id', $v)))
            ->when($filters['search'] ?? null, function ($q, $term) {
                $like = '%'.addcslashes($term, '\\%_').'%';
                $q->where(fn ($q) => $q->where('title', 'ilike', $like)->orWhere('description', 'ilike', $like));
            })
            ->when($request->boolean('overdue'), fn ($q) => $q->overdue())
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        return TaskResource::collection($tasks);
    }

    public function store(StoreTaskRequest $request): JsonResponse
    {
        $data = $request->validated();
        $status = $data['status'] ?? TaskStatus::Todo->value;

        $task = DB::transaction(function () use ($request, $data, $status) {
            $task = new Task(Arr::except($data, ['label_ids', 'checklist']));
            $task->user_id = $request->user()->id;
            $task->position = $this->nextPosition($request, $status);
            $task->save();

            $this->syncRelations($task, $data);

            return $task;
        });

        return (new TaskResource($this->fresh($task)))->response()->setStatusCode(201);
    }

    public function show(Request $request, int $task): TaskResource
    {
        return new TaskResource($this->findOwned($request, $task)->load(self::RELATIONS));
    }

    public function update(StoreTaskRequest $request, int $task): TaskResource
    {
        $model = $this->findOwned($request, $task);
        $data = $request->validated();
        $before = $model->status;

        $spawned = DB::transaction(function () use ($request, $model, $data, $before) {
            $attributes = Arr::except($data, ['label_ids', 'checklist']);

            // Moving to another column through a plain edit puts it at the end.
            if (isset($attributes['status']) && $attributes['status'] !== $before->value) {
                $attributes['position'] = $this->nextPosition($request, $attributes['status']);
            }

            $model->update($attributes);
            $this->syncRelations($model, $data);

            return $before !== TaskStatus::Done && $model->status === TaskStatus::Done
                ? $this->recurrence->spawnNext($model)
                : null;
        });

        return (new TaskResource($this->fresh($model)))->additional([
            'spawned' => $spawned ? new TaskResource($this->fresh($spawned)) : null,
        ]);
    }

    /** Drag & drop: place a task at an index within a status column. */
    public function move(MoveTaskRequest $request, int $task): AnonymousResourceCollection
    {
        $model = $this->findOwned($request, $task);
        $status = $request->validated('status');
        $position = $request->validated('position');
        $before = $model->status;

        DB::transaction(function () use ($request, $model, $status, $position, $before) {
            $model->status = $status;
            $model->save();

            $siblings = $request->user()->tasks()
                ->where('status', $status)
                ->whereKeyNot($model->id)
                ->orderBy('position')->orderBy('id')
                ->pluck('id')
                ->all();

            array_splice($siblings, min($position, count($siblings)), 0, [$model->id]);

            foreach ($siblings as $index => $id) {
                $request->user()->tasks()->whereKey($id)->update(['position' => $index]);
            }

            if ($before !== TaskStatus::Done && $model->status === TaskStatus::Done) {
                $this->recurrence->spawnNext($model);
            }
        });

        return TaskResource::collection(
            $request->user()->tasks()->with(self::RELATIONS)->orderBy('position')->orderBy('id')->get()
        );
    }

    /**
     * Snooze: push the reminder to a new time. The Task model re-arms `reminded_at` when
     * `remind_at` changes, and the now-outdated unread reminders for the task are cleared.
     */
    public function snooze(Request $request, int $task): TaskResource
    {
        $data = $request->validate([
            'until' => ['required', 'date', 'after:now', 'before:'.now()->addYear()->toIso8601String()],
        ]);

        $model = $this->findOwned($request, $task);
        abort_if($model->status === TaskStatus::Done, 422, 'Completed tasks cannot be snoozed.');

        $model->update(['remind_at' => $data['until']]);
        $model->clearUnreadReminders();

        return new TaskResource($this->fresh($model));
    }

    /** Soft delete: the task can be restored (undo) and is purged after 30 days. */
    public function destroy(Request $request, int $task): JsonResponse
    {
        $this->findOwned($request, $task)->delete();

        return response()->json(null, 204);
    }

    public function restore(Request $request, int $task): TaskResource
    {
        $model = $request->user()->tasks()->onlyTrashed()->findOrFail($task);
        $model->restore();

        return new TaskResource($this->fresh($model));
    }

    private function findOwned(Request $request, int $id): Task
    {
        return $request->user()->tasks()->findOrFail($id);
    }

    private function nextPosition(Request $request, string $status): int
    {
        return (int) $request->user()->tasks()->where('status', $status)->max('position') + 1;
    }

    private function fresh(Task $task): Task
    {
        return $task->refresh()->load(self::RELATIONS);
    }

    private function syncRelations(Task $task, array $data): void
    {
        if (array_key_exists('label_ids', $data)) {
            $task->labels()->sync($data['label_ids']);
        }

        if (array_key_exists('checklist', $data)) {
            $existing = $task->checklistItems()->get()->keyBy('id');
            $keep = [];

            // validated() rebuilds arrays in rule order (items with an `id` come first), so
            // restore the order the client sent before using the index as the position.
            $items = $data['checklist'];
            ksort($items);

            foreach (array_values($items) as $position => $item) {
                $attributes = [
                    'title' => $item['title'],
                    'is_done' => (bool) ($item['is_done'] ?? false),
                    'position' => $position,
                ];

                // Ids that don't belong to this task are ignored and treated as new items.
                $model = isset($item['id']) ? $existing->get($item['id']) : null;
                if ($model) {
                    $model->update($attributes);
                } else {
                    $model = $task->checklistItems()->create($attributes);
                }

                $keep[] = $model->id;
            }

            $task->checklistItems()->whereNotIn('id', $keep)->delete();
        }
    }
}
