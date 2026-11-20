<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('recurrence', 10)->default('none')->after('priority');
            $table->timestampTz('recurred_at')->nullable()->after('completed_at');
            $table->softDeletesTz();

            $table->index(['user_id', 'deleted_at']);
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'deleted_at']);
            $table->dropIndex(['deleted_at']);
            $table->dropSoftDeletesTz();
            $table->dropColumn(['recurrence', 'recurred_at']);
        });
    }
};
