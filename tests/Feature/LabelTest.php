<?php

namespace Tests\Feature;

use App\Models\Label;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LabelTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    public function test_create_assigns_a_palette_colour_by_default(): void
    {
        $this->postJson('/api/labels', ['name' => 'Work'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Work')
            ->assertJsonPath('data.tasks_count', 0)
            ->assertJsonPath('data.color', Label::PALETTE[0]);

        $this->postJson('/api/labels', ['name' => 'Home'])->assertJsonPath('data.color', Label::PALETTE[1]);
    }

    public function test_names_are_unique_per_user_ignoring_case(): void
    {
        Label::factory()->for($this->user)->create(['name' => 'Work']);

        $this->postJson('/api/labels', ['name' => 'work'])->assertUnprocessable()->assertJsonValidationErrors('name');

        // Another user may reuse the name.
        Label::factory()->create(['name' => 'Errands']);
        $this->postJson('/api/labels', ['name' => 'Errands'])->assertCreated();
    }

    public function test_validation(): void
    {
        $this->postJson('/api/labels', ['name' => ''])->assertJsonValidationErrors('name');
        $this->postJson('/api/labels', ['name' => str_repeat('a', 41)])->assertJsonValidationErrors('name');
        $this->postJson('/api/labels', ['name' => 'x', 'color' => 'red'])->assertJsonValidationErrors('color');
        $this->postJson('/api/labels', ['name' => 'x', 'color' => '#12345'])->assertJsonValidationErrors('color');
    }

    public function test_rename_keeping_own_name_and_recolour(): void
    {
        $label = Label::factory()->for($this->user)->create(['name' => 'Work', 'color' => '#111111']);

        $this->patchJson("/api/labels/{$label->id}", ['name' => 'Work', 'color' => '#ff0000'])
            ->assertOk()->assertJsonPath('data.color', '#ff0000');
        $this->patchJson("/api/labels/{$label->id}", ['name' => 'WORK'])->assertOk();
    }

    public function test_index_is_scoped_sorted_and_counts_tasks(): void
    {
        $b = Label::factory()->for($this->user)->create(['name' => 'b']);
        Label::factory()->for($this->user)->create(['name' => 'a']);
        Label::factory()->create(['name' => 'not-mine']);
        Task::factory()->for($this->user)->create()->labels()->attach($b);

        $res = $this->getJson('/api/labels')->assertOk();
        $this->assertSame(['a', 'b'], collect($res->json('data'))->pluck('name')->all());
        $this->assertSame([0, 1], collect($res->json('data'))->pluck('tasks_count')->all());
    }

    public function test_cannot_touch_other_users_labels(): void
    {
        $other = Label::factory()->create();

        $this->patchJson("/api/labels/{$other->id}", ['name' => 'hax'])->assertNotFound();
        $this->deleteJson("/api/labels/{$other->id}")->assertNotFound();
    }

    public function test_deleting_a_label_detaches_it_but_keeps_tasks(): void
    {
        $label = Label::factory()->for($this->user)->create();
        $task = Task::factory()->for($this->user)->create();
        $task->labels()->attach($label);

        $this->deleteJson("/api/labels/{$label->id}")->assertNoContent();

        $this->assertModelExists($task);
        $this->assertDatabaseCount('label_task', 0);
    }

    public function test_tasks_can_be_labelled_and_filtered(): void
    {
        $work = Label::factory()->for($this->user)->create(['name' => 'Work']);
        $home = Label::factory()->for($this->user)->create(['name' => 'Home']);

        $this->postJson('/api/tasks', ['title' => 'Report', 'label_ids' => [$work->id, $home->id]])
            ->assertCreated()
            ->assertJsonCount(2, 'data.labels')
            ->assertJsonPath('data.labels.0.name', 'Home');
        $this->postJson('/api/tasks', ['title' => 'Plain'])->assertJsonCount(0, 'data.labels');

        $this->getJson("/api/tasks?label_id={$work->id}")->assertJsonCount(1, 'data');
        $this->getJson('/api/tasks')->assertJsonCount(2, 'data');
    }

    public function test_label_ids_on_update_replace_the_set(): void
    {
        $a = Label::factory()->for($this->user)->create();
        $b = Label::factory()->for($this->user)->create();
        $task = Task::factory()->for($this->user)->create();
        $task->labels()->attach($a);

        $this->patchJson("/api/tasks/{$task->id}", ['label_ids' => [$b->id]])
            ->assertOk()->assertJsonCount(1, 'data.labels')->assertJsonPath('data.labels.0.id', $b->id);

        // Omitting label_ids leaves them alone; an empty array clears them.
        $this->patchJson("/api/tasks/{$task->id}", ['title' => 'x'])->assertJsonCount(1, 'data.labels');
        $this->patchJson("/api/tasks/{$task->id}", ['label_ids' => []])->assertJsonCount(0, 'data.labels');
    }

    public function test_cannot_attach_someone_elses_label(): void
    {
        $foreign = Label::factory()->create();

        $this->postJson('/api/tasks', ['title' => 'x', 'label_ids' => [$foreign->id]])
            ->assertUnprocessable()->assertJsonValidationErrors('label_ids.0');
        $this->postJson('/api/tasks', ['title' => 'x', 'label_ids' => [999999]])->assertUnprocessable();
    }
}
