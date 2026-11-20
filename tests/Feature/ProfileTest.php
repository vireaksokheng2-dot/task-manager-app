<?php

namespace Tests\Feature;

use App\Models\Label;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskReminder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_update_profile_and_preferences(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/me', ['name' => 'New Name', 'timezone' => 'Asia/Phnom_Penh', 'email_reminders' => false])
            ->assertOk()
            ->assertJsonPath('user.name', 'New Name')
            ->assertJsonPath('user.timezone', 'Asia/Phnom_Penh')
            ->assertJsonPath('user.email_reminders', false);

        $this->getJson('/api/me')->assertJsonPath('user.timezone', 'Asia/Phnom_Penh');
    }

    public function test_profile_validation(): void
    {
        $user = User::factory()->create();
        User::factory()->create(['email' => 'taken@example.com']);
        Sanctum::actingAs($user);

        $this->patchJson('/api/me', ['timezone' => 'Mars/Olympus'])->assertJsonValidationErrors('timezone');
        $this->patchJson('/api/me', ['email' => 'taken@example.com'])->assertJsonValidationErrors('email');
        $this->patchJson('/api/me', ['email' => $user->email])->assertOk(); // own email is fine
        $this->patchJson('/api/me', ['name' => ''])->assertJsonValidationErrors('name');
    }

    public function test_register_stores_the_timezone(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Tz', 'email' => 'tz@example.com', 'timezone' => 'Europe/Paris',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertCreated()->assertJsonPath('user.timezone', 'Europe/Paris');

        $this->postJson('/api/register', [
            'name' => 'Tz', 'email' => 'tz2@example.com', 'timezone' => 'Nope/Nope',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertJsonValidationErrors('timezone');

        $this->postJson('/api/register', [
            'name' => 'Tz', 'email' => 'tz3@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertCreated()->assertJsonPath('user.timezone', 'UTC');
    }

    public function test_change_password_requires_the_current_one_and_signs_out_other_devices(): void
    {
        $user = User::factory()->create(['password' => 'old-password']);
        $current = $user->createToken('this-device')->plainTextToken;
        $user->createToken('other-device');

        $this->withToken($current)->putJson('/api/me/password', [
            'current_password' => 'nope', 'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ])->assertJsonValidationErrors('current_password');

        $this->withToken($current)->putJson('/api/me/password', [
            'current_password' => 'old-password', 'password' => 'old-password', 'password_confirmation' => 'old-password',
        ])->assertJsonValidationErrors('password');

        $this->withToken($current)->putJson('/api/me/password', [
            'current_password' => 'old-password', 'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ])->assertOk();

        $this->assertSame(1, $user->tokens()->count(), 'only the current device stays signed in');
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'new-password-1'])->assertOk();
    }

    public function test_delete_account_removes_everything(): void
    {
        $user = User::factory()->create(['password' => 'secret-123']);
        $task = Task::factory()->for($user)->create();
        $task->delete(); // trashed tasks must go too
        Task::factory()->for($user)->create();
        Label::factory()->for($user)->create();
        $other = Task::factory()->create();
        $token = $user->createToken('t')->plainTextToken;

        $this->withToken($token)->deleteJson('/api/me', ['password' => 'wrong'])->assertJsonValidationErrors('password');
        $this->assertModelExists($user);

        $this->withToken($token)->deleteJson('/api/me', ['password' => 'secret-123'])->assertNoContent();

        $this->assertModelMissing($user);
        $this->assertDatabaseCount('tasks', 1);
        $this->assertDatabaseCount('labels', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertModelExists($other);
    }

    public function test_login_is_locked_out_after_repeated_failures(): void
    {
        RateLimiter::clear('lock@example.com|127.0.0.1');
        User::factory()->create(['email' => 'lock@example.com', 'password' => 'right-password']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => 'lock@example.com', 'password' => 'bad'])->assertUnprocessable();
        }

        // Even the correct password is refused while locked out.
        $this->postJson('/api/login', ['email' => 'lock@example.com', 'password' => 'right-password'])
            ->assertStatus(429)->assertJsonValidationErrors('email');

        // A different account from the same IP is unaffected.
        User::factory()->create(['email' => 'free@example.com', 'password' => 'right-password']);
        $this->postJson('/api/login', ['email' => 'free@example.com', 'password' => 'right-password'])->assertOk();
    }

    public function test_successful_login_resets_the_failure_counter(): void
    {
        User::factory()->create(['email' => 'ok@example.com', 'password' => 'right-password']);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', ['email' => 'ok@example.com', 'password' => 'bad']);
        }
        $this->postJson('/api/login', ['email' => 'ok@example.com', 'password' => 'right-password'])->assertOk();
        $this->postJson('/api/login', ['email' => 'ok@example.com', 'password' => 'bad'])->assertUnprocessable();
    }

    public function test_email_reminders_preference_controls_the_mail_channel(): void
    {
        $on = User::factory()->create(['email_reminders' => true]);
        $off = User::factory()->create(['email_reminders' => false]);
        $task = Task::factory()->for($on)->create();

        $this->assertSame(['database', 'mail'], (new TaskReminder($task))->via($on));
        $this->assertSame(['database'], (new TaskReminder($task))->via($off));
    }

    public function test_reminder_email_shows_due_time_in_the_users_timezone(): void
    {
        $user = User::factory()->create(['timezone' => 'Asia/Phnom_Penh']);
        $task = Task::factory()->for($user)->create(['due_at' => '2026-03-10 02:00:00']);

        $mail = (new TaskReminder($task))->toMail($user)->render();

        $this->assertStringContainsString('9:00 AM', (string) $mail);
        $this->assertStringContainsString('Asia/Phnom_Penh', (string) $mail);
    }

    public function test_security_headers_are_present(): void
    {
        $this->getJson('/up')->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('X-Frame-Options', 'DENY');
        $this->get('/')->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
}
