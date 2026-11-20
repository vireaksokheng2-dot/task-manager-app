<?php

namespace Database\Factories;

use App\Models\ChecklistItem;
use App\Models\Task;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ChecklistItem> */
class ChecklistItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'task_id' => Task::factory(),
            'title' => rtrim(fake()->sentence(3), '.'),
            'is_done' => false,
            'position' => 0,
        ];
    }
}
