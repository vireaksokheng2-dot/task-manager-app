<script setup lang="ts">
import { computed } from 'vue';
import TaskRow from '@/components/TaskRow.vue';
import { groupByDay, startOfDay } from '@/lib/dates';
import { collapse } from '@/lib/motion';
import { useTaskStore } from '@/stores/tasks';
import type { Task, TaskStatus } from '@/types';

const props = defineProps<{ tasks: Task[] }>();
defineEmits<{
    open: [task: Task];
    toggle: [task: Task];
    status: [task: Task, status: TaskStatus];
    snooze: [task: Task, until: Date];
}>();

const store = useTaskStore();

// A task sits where its due date says. With no due date, an upcoming reminder places it instead;
// a reminder that already fired is not a deadline, so those tasks go under "No date" rather than
// being flagged overdue.
function when(t: Task): string | null {
    if (t.due_at) return t.due_at;
    return t.remind_at && new Date(t.remind_at).getTime() >= startOfDay(new Date(store.now)).getTime()
        ? t.remind_at
        : null;
}
const time = (t: Task) => (when(t) ? new Date(when(t)!).getTime() : Infinity);

const groups = computed(() => {
    const open = props.tasks.filter((t) => t.status !== 'done').sort((a, b) => time(a) - time(b) || a.id - b.id);
    return groupByDay(open, when, store.now);
});

const tone = {
    overdue: 'text-red-700 dark:text-red-400',
    today: 'text-accent-700 dark:text-accent-300',
    normal: 'text-ink-900 dark:text-ink-100',
} as const;
</script>

<template>
    <div>
        <TransitionGroup tag="div" v-bind="collapse" class="space-y-7">
            <section
                v-for="(g, i) in groups"
                :key="g.key"
                class="rise"
                :style="{ '--d': `${Math.min(i, 5) * 60}ms` }"
                :aria-labelledby="`agenda-${g.key}`"
            >
                <header class="mb-2 flex items-baseline gap-2 px-1">
                    <h2 :id="`agenda-${g.key}`" class="text-sm font-semibold" :class="tone[g.tone]">{{ g.title }}</h2>
                    <span v-if="g.subtitle" class="text-xs text-ink-600 dark:text-ink-400">{{ g.subtitle }}</span>
                    <span class="ml-auto text-xs text-ink-600 tabular-nums dark:text-ink-400">{{
                        g.items.length
                    }}</span>
                </header>
                <TransitionGroup
                    tag="ul"
                    v-bind="collapse"
                    class="card divide-y divide-ink-200 overflow-hidden dark:divide-ink-800"
                >
                    <TaskRow
                        v-for="t in g.items"
                        :key="t.id"
                        :task="t"
                        @open="$emit('open', $event)"
                        @toggle="$emit('toggle', $event)"
                        @status="(task, s) => $emit('status', task, s)"
                        @snooze="(task, until) => $emit('snooze', task, until)"
                    />
                </TransitionGroup>
            </section>
        </TransitionGroup>

        <div v-if="!groups.length" class="card animate-pop-in flex flex-col items-center px-6 py-14 text-center">
            <span
                class="mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M20 6 9 17l-5-5" stroke-dasharray="30" class="animate-draw" />
                </svg>
            </span>
            <h2 class="text-base font-semibold">You're all caught up</h2>
            <p class="mt-1 max-w-xs text-sm text-ink-600 dark:text-ink-400">
                Nothing open matches right now. Add a task above and it will appear here, ordered by when it's due.
            </p>
        </div>
    </div>
</template>
