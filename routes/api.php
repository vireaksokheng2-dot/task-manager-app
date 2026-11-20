<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LabelController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\TaskController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::patch('/me', [ProfileController::class, 'update']);
    Route::put('/me/password', [ProfileController::class, 'password']);
    Route::delete('/me', [ProfileController::class, 'destroy']);

    Route::post('/tasks/{task}/move', [TaskController::class, 'move']);
    Route::post('/tasks/{task}/snooze', [TaskController::class, 'snooze']);
    Route::post('/tasks/{task}/restore', [TaskController::class, 'restore']);
    Route::apiResource('tasks', TaskController::class);

    Route::apiResource('labels', LabelController::class)->except('show');

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);
});
