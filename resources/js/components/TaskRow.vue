<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import LabelChip from '@/components/LabelChip.vue';
import PriorityTag from '@/components/PriorityTag.vue';
import SnoozeOptions from '@/components/SnoozeOptions.vue';
import TaskMeta from '@/components/TaskMeta.vue';
import { usePop } from '@/lib/pop';
import { STATUSES, type Task, type TaskStatus } from '@/types';

const props = withDefaults(defineProps<{ task: Task; showStatus?: boolean }>(), { showStatus: false });
const emit = defineEmits<{
    open: [task: Task];
    toggle: [task: Task];
    status: [task: Task, status: TaskStatus];
    snooze: [task: Task, until: Date];
}>();

const { popping, trigger: pop } = usePop();
const done = computed(() => props.task.status === 'done');
const snoozing = ref(false);
// Snoozing only makes sense while a reminder is pending or has just fired.
const canSnooze = computed(() => !done.value && !!props.task.remind_at);

function pick(until: Date) {
    snoozing.value = false;
    emit('snooze', props.task, until);
}
</script>

<template>
    <li class="px-4 py-3" :data-task-id="task.id">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <input
                type="checkbox"
                class="check"
                :class="{ 'check-pop': popping }"
                :checked="done"
                :aria-label="done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`"
                @change="(pop(), emit('toggle', task))"
            />
            <button class="min-w-0 flex-1 basis-48 cursor-pointer text-left" @click="emit('open', task)">
                <span
                    class="block truncate text-sm font-medium"
                    :class="{ 'text-ink-600 line-through dark:text-ink-400': done }"
                    >{{ task.title }}</span
                >
                <span class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <TaskMeta :task="task" />
                    <LabelChip v-for="l in task.labels" :key="l.id" :label="l" />
                </span>
            </button>

            <PriorityTag :priority="task.priority" class="sm:w-[4.5rem]" />

            <!-- Fixed-width slot so priorities and status selects line up down the list. -->
            <span class="sm:w-[5.5rem]">
                <button
                    v-if="canSnooze"
                    type="button"
                    class="btn btn-ghost btn-sm"
                    :aria-expanded="snoozing"
                    :aria-label="`Snooze reminder for ${task.title}`"
                    @click="snoozing = !snoozing"
                >
                    <Icon name="snooze" :size="14" />Snooze
                </button>
            </span>

            <select
                v-if="showStatus"
                class="field !h-8 !w-auto !py-0 text-xs"
                :value="task.status"
                :aria-label="`Status of ${task.title}`"
                @change="emit('status', task, ($event.target as HTMLSelectElement).value as TaskStatus)"
            >
                <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
        </div>

        <div v-if="snoozing" class="mt-2.5 animate-fade-in pl-[30px]">
            <p class="mb-1.5 text-xs text-ink-600 dark:text-ink-400">Remind me again in…</p>
            <SnoozeOptions :label="`Snooze ${task.title} until`" @pick="pick" />
        </div>
    </li>
</template>
