<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Demo account: demo@example.com / password */
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'demo@example.com'],
            ['name' => 'Demo User', 'password' => 'password', 'timezone' => 'UTC'],
        );

        if ($user->tasks()->withTrashed()->exists()) {
            return;
        }

        $labels = collect(['Work' => '#6366f1', 'Personal' => '#10b981', 'Admin' => '#f59e0b'])
            ->map(fn (string $color, string $name) => $user->labels()->create(['name' => $name, 'color' => $color]));

        $tasks = [
            ['Plan the week', 'Pick the three things that matter most.', 'todo', 'high', now()->addDay(), now()->addHours(2), 'weekly', ['Work'], ['Review calendar', 'Pick top 3 goals', 'Block focus time']],
            ['Pay electricity bill', null, 'todo', 'urgent', now()->subDay(), null, 'monthly', ['Admin', 'Personal'], []],
            ['Draft project proposal', 'Outline scope, timeline and budget.', 'in_progress', 'medium', now()->addDays(3), now()->addDays(2), 'none', ['Work'], ['Outline', 'Estimate budget', 'Share for review']],
            ['Book dentist appointment', null, 'in_progress', 'low', null, null, 'none', ['Personal'], []],
            ['Set up Taskly', 'Create an account and add a few tasks.', 'done', 'low', null, null, 'none', [], []],
        ];

        foreach ($tasks as $i => [$title, $description, $status, $priority, $due, $remind, $recurrence, $labelNames, $items]) {
            $task = $user->tasks()->create([
                'title' => $title,
                'description' => $description,
                'status' => $status,
                'priority' => $priority,
                'recurrence' => $recurrence,
                'due_at' => $due,
                'remind_at' => $remind,
                'position' => $i,
            ]);

            $task->labels()->sync($labels->only($labelNames)->pluck('id'));

            foreach ($items as $position => $item) {
                $task->checklistItems()->create(['title' => $item, 'is_done' => $position === 0, 'position' => $position]);
            }
        }
    }
}
