<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status', 20)->default('todo');
            $table->string('priority', 20)->default('medium');
            $table->timestampTz('due_at')->nullable();
            $table->timestampTz('remind_at')->nullable();
            $table->timestampTz('reminded_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestampsTz();

            $table->index(['user_id', 'status', 'position']);
            $table->index(['remind_at', 'reminded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
