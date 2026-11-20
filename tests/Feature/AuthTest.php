<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_and_use_token(): void
    {
        $res = $this->postJson('/api/register', [
            'name' => 'Ada', 'email' => 'ada@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertCreated()->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token']);

        $this->withToken($res->json('token'))->getJson('/api/me')
            ->assertOk()->assertJsonPath('user.email', 'ada@example.com');
    }

    public function test_registration_validates_input(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/register', [
            'name' => '', 'email' => 'taken@example.com', 'password' => 'short',
        ])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email', 'password']);
    }

    public function test_login_success_and_failure(): void
    {
        User::factory()->create(['email' => 'a@example.com', 'password' => 'password123']);

        $this->postJson('/api/login', ['email' => 'a@example.com', 'password' => 'password123'])
            ->assertOk()->assertJsonStructure(['token']);

        $this->postJson('/api/login', ['email' => 'a@example.com', 'password' => 'wrong'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_logout_revokes_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('spa')->plainTextToken;

        $this->withToken($token)->postJson('/api/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_tasks_require_authentication(): void
    {
        $this->getJson('/api/tasks')->assertUnauthorized();
    }
}
