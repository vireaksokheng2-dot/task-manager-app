<?php

namespace App\Http\Requests;

use App\Enums\Recurrence;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', Rule::enum(TaskStatus::class)],
            'priority' => ['sometimes', Rule::enum(TaskPriority::class)],
            'recurrence' => ['sometimes', Rule::enum(Recurrence::class)],
            'due_at' => ['nullable', 'date'],
            'remind_at' => ['nullable', 'date'],
            'label_ids' => ['sometimes', 'array', 'max:20'],
            'label_ids.*' => ['integer', 'distinct', Rule::exists('labels', 'id')->where('user_id', $this->user()->id)],
            'checklist' => ['sometimes', 'array', 'max:50'],
            'checklist.*.id' => ['nullable', 'integer'],
            'checklist.*.title' => ['required', 'string', 'max:255'],
            'checklist.*.is_done' => ['sometimes', 'boolean'],
        ];
    }
}
