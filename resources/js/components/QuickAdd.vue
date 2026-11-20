<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import Icon from '@/components/Icon.vue';
import { ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/dates';
import { parseQuickAdd } from '@/lib/quickAdd';
import { useLabelStore } from '@/stores/labels';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';

const store = useTaskStore();
const labels = useLabelStore();
const toasts = useToastStore();

// Short on phones, where the long example would be cut off.
const placeholder =
    typeof window !== 'undefined' && window.innerWidth < 640
        ? 'Add a task…'
        : 'Add a task — try “Call mom tomorrow 5pm !high”';

const text = ref('');
const busy = ref(false);
const input = useTemplateRef<HTMLInputElement>('input');

const parsed = computed(() => parseQuickAdd(text.value, labels.labels));
const hasInput = computed(() => text.value.trim().length > 0);
// A reminder fires at the due time, so it only makes sense for a moment that is still ahead.
const remindsAtDue = computed(() => !!parsed.value.due && parsed.value.due.getTime() > Date.now());

async function submit() {
    if (!hasInput.value || busy.value) return;
    const p = parsed.value;
    busy.value = true;
    try {
        await store.create({
            title: p.title,
            ...(p.due ? { due_at: p.due.toISOString() } : {}),
            ...(p.due && remindsAtDue.value ? { remind_at: p.due.toISOString() } : {}),
            ...(p.priority ? { priority: p.priority } : {}),
            ...(p.recurrence ? { recurrence: p.recurrence } : {}),
            ...(p.labelIds.length ? { label_ids: p.labelIds } : {}),
        });
        toasts.push(
            remindsAtDue.value && p.due ? `Added — reminder ${formatRelative(p.due.toISOString())}` : 'Task added',
            'success',
            3000,
        );
        text.value = '';
    } catch (e) {
        toasts.push(
            e instanceof ApiError ? (e.first('title') ?? e.message) : 'Could not add the task. Please try again.',
            'error',
        );
    } finally {
        busy.value = false;
        input.value?.focus();
    }
}

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
    <form class="relative" aria-label="Quick add" @submit.prevent="submit">
        <div class="relative">
            <Icon
                name="plus"
                :size="18"
                class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-500 dark:text-ink-400"
            />
            <input
                ref="input"
                v-model="text"
                type="text"
                class="field !h-12 !rounded-xl !pr-24 !pl-11 !text-[15px]"
                maxlength="300"
                :placeholder="placeholder"
                aria-label="Quick add a task"
                aria-describedby="quick-add-hint"
                autocomplete="off"
                :disabled="busy"
            />
            <button
                type="submit"
                class="btn btn-primary btn-sm absolute top-1/2 right-2 -translate-y-1/2"
                :disabled="!hasInput || busy"
            >
                Add
                <span class="kbd !border-white/30 !bg-white/15 !text-white" aria-hidden="true">↵</span>
            </button>
        </div>

        <p id="quick-add-hint" class="sr-only">
            Type a task. Dates, times, priorities, labels and repeats are understood as you type; press Enter to add.
        </p>

        <div
            v-if="hasInput && parsed.recognized.length"
            class="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-xs"
            aria-live="polite"
        >
            <span class="text-ink-600 dark:text-ink-400">Understood:</span>
            <span
                v-for="c in parsed.recognized"
                :key="c.kind + c.text"
                class="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 font-medium text-accent-700 dark:bg-accent-950 dark:text-accent-300"
            >
                <Icon
                    :name="
                        c.kind === 'due'
                            ? 'calendar'
                            : c.kind === 'repeat'
                              ? 'repeat'
                              : c.kind === 'priority'
                                ? 'flag'
                                : 'tag'
                    "
                    :size="12"
                />{{ c.text }}
            </span>
            <span v-if="remindsAtDue" class="inline-flex items-center gap-1 text-ink-600 dark:text-ink-400">
                <Icon name="bell" :size="12" />reminder at that time
            </span>
        </div>
    </form>
</template>
