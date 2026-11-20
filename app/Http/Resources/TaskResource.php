<?php

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Task */
class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status->value,
            'priority' => $this->priority->value,
            'recurrence' => $this->recurrence->value,
            'due_at' => $this->due_at?->toIso8601String(),
            'remind_at' => $this->remind_at?->toIso8601String(),
            'reminded_at' => $this->reminded_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'position' => $this->position,
            'labels' => LabelResource::collection($this->whenLoaded('labels')),
            'checklist' => $this->whenLoaded('checklistItems', fn () => $this->checklistItems->map(fn ($i) => [
                'id' => $i->id,
                'title' => $i->title,
                'is_done' => $i->is_done,
            ])->values()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
