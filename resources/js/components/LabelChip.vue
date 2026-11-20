<script setup lang="ts">
import type { Label } from '@/types';

defineProps<{ label: Label }>();
</script>

<template>
    <span
        class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 py-0.5 pr-2 pl-1.5 text-xs text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200"
    >
        <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: label.color }" aria-hidden="true" />
        <span class="truncate">{{ label.name }}</span>
    </span>
</template>
