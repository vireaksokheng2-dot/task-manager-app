<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $unread = $request->user()->unreadNotifications()->latest()->limit(50)->get();

        // Only live, unfinished tasks are worth nagging about: a reminder for a task that was
        // completed or deleted since it fired is stale and is left out of the inbox.
        $taskIds = $unread->map(fn ($n) => $n->data['task_id'] ?? null)->filter()->unique()->values();
        $tasks = $request->user()->tasks()
            ->whereIn('id', $taskIds)
            ->where('status', '!=', TaskStatus::Done->value)
            ->get()
            ->keyBy('id');

        $notifications = $unread
            ->filter(fn ($n) => empty($n->data['task_id']) || $tasks->has($n->data['task_id']))
            ->map(function ($n) use ($tasks) {
                $task = $tasks->get($n->data['task_id'] ?? 0);

                return [
                    'id' => $n->id,
                    'type' => $n->data['type'] ?? 'generic',
                    'message' => $n->data['message'] ?? '',
                    'task_id' => $n->data['task_id'] ?? null,
                    'task' => $task ? [
                        'title' => $task->title,
                        'priority' => $task->priority->value,
                        'due_at' => $task->due_at?->toIso8601String(),
                    ] : null,
                    'created_at' => $n->created_at->toIso8601String(),
                ];
            })
            ->values();

        return response()->json(['data' => $notifications]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $request->user()->unreadNotifications()->whereKey($id)->firstOrFail()->markAsRead();

        return response()->json(null, 204);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(null, 204);
    }
}
