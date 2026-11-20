<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';
import { formatDistance, formatRelative, isOverdue } from '@/lib/dates';
import { useTaskStore } from '@/stores/tasks';
import type { Task } from '@/types';

const props = withDefaults(defineProps<{ task: Task; checklist?: boolean }>(), { checklist: true });

const store = useTaskStore();
const done = computed(() => props.task.status === 'done');
const overdue = computed(() => isOverdue(props.task.due_at, done.value, store.now));
// Within two hours of the deadline, show a live countdown ("in 12 min"); the store clock ticks every 30s.
const dueSoon = computed(() => {
    if (!props.task.due_at || done.value) return false;
    const ms = new Date(props.task.due_at).getTime() - store.now;
    return ms > 0 && ms <= 2 * 3_600_000;
});
const checklistDone = computed(() => props.task.checklist.filter((i) => i.is_done).length);
const muted = 'text-ink-600 dark:text-ink-400';
</script>

<template>
    <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
            v-if="task.due_at"
            class="inline-flex items-center gap-1 tabular-nums"
            :class="overdue ? 'font-medium text-red-700 dark:text-red-400' : muted"
            :title="overdue ? 'Overdue' : 'Due'"
        >
            <Icon name="calendar" :size="13" />{{ formatRelative(task.due_at, store.now) }}
        </span>
        <span
            v-if="dueSoon"
            class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 tabular-nums dark:bg-amber-950 dark:text-amber-200"
            title="Due soon"
            >{{ formatDistance(task.due_at!, store.now) }}</span
        >
        <span
            v-if="task.remind_at && !done"
            class="inline-flex items-center gap-1 tabular-nums"
            :class="muted"
            :title="task.reminded_at ? 'Reminder sent' : 'Reminder scheduled'"
        >
            <Icon :name="task.reminded_at ? 'bell-ring' : 'bell'" :size="13" />{{
                formatRelative(task.remind_at, store.now)
            }}
        </span>
        <span
            v-if="task.recurrence !== 'none'"
            class="inline-flex items-center gap-1"
            :class="muted"
            :title="`Repeats ${task.recurrence}`"
        >
            <Icon name="repeat" :size="13" />{{ task.recurrence }}
        </span>
        <span
            v-if="checklist && task.checklist.length"
            class="inline-flex items-center gap-1 tabular-nums"
            :class="muted"
            :title="`${checklistDone} of ${task.checklist.length} checklist items done`"
        >
            <Icon name="checklist" :size="13" />{{ checklistDone }}/{{ task.checklist.length }}
        </span>
    </span>
</template>
