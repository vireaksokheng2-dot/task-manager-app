<script setup lang="ts">
import { priorityDots, priorityLabels } from '@/lib/ui';
import type { TaskPriority } from '@/types';

defineProps<{ priority: TaskPriority }>();
</script>

<template>
    <span class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">
        <span class="size-2 rounded-full" :class="priorityDots[priority]" aria-hidden="true" />
        {{ priorityLabels[priority] }}
    </span>
</template>
