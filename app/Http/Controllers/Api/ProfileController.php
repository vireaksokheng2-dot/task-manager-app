<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Laravel\Sanctum\PersonalAccessToken;

class ProfileController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'timezone' => ['sometimes', 'required', 'timezone:all'],
            'email_reminders' => ['sometimes', 'boolean'],
        ]);

        $user->update($data);

        return response()->json(['user' => new UserResource($user->refresh())]);
    }

    /** Changing the password signs out every other device. */
    public function password(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', Password::min(8), 'different:current_password'],
        ]);

        $user->update(['password' => $data['password']]);

        $current = $user->currentAccessToken();
        $user->tokens()
            ->when($current instanceof PersonalAccessToken, fn ($q) => $q->where('id', '!=', $current->id))
            ->delete();

        return response()->json(['message' => 'Password updated.']);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate(['password' => ['required', 'current_password']]);

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            $user->notifications()->delete();
            $user->tasks()->withTrashed()->forceDelete();
            $user->delete();
        });

        return response()->json(null, 204);
    }
}
