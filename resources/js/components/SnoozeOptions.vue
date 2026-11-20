<script setup lang="ts">
import { snoozePresets } from '@/lib/dates';

defineProps<{ label?: string }>();
const emit = defineEmits<{ pick: [until: Date] }>();

// Computed once when shown, so the options are relative to the moment the user opened them.
const presets = snoozePresets();
const hint = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<template>
    <div class="flex flex-wrap items-center gap-1.5" role="group" :aria-label="label ?? 'Snooze until'">
        <button
            v-for="p in presets"
            :key="p.id"
            type="button"
            class="btn btn-outline btn-sm"
            :title="hint(p.until)"
            @click="emit('pick', p.until)"
        >
            {{ p.label }}
        </button>
    </div>
</template>
