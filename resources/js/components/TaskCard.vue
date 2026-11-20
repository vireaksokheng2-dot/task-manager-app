<script setup lang="ts">
import { computed } from 'vue';
import LabelChip from '@/components/LabelChip.vue';
import PriorityTag from '@/components/PriorityTag.vue';
import TaskMeta from '@/components/TaskMeta.vue';
import { draggingId } from '@/lib/drag';
import { usePop } from '@/lib/pop';
import type { Task } from '@/types';

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ open: [task: Task]; toggle: [task: Task] }>();

const MAX_LABELS = 3;
const { popping, trigger: pop } = usePop();

const done = computed(() => props.task.status === 'done');
const dragging = computed(() => draggingId.value === props.task.id);
const checklistDone = computed(() => props.task.checklist.filter((i) => i.is_done).length);
const checklistPct = computed(() =>
    props.task.checklist.length ? Math.round((checklistDone.value / props.task.checklist.length) * 100) : 0,
);

function onDragStart(e: DragEvent) {
    draggingId.value = props.task.id;
    e.dataTransfer?.setData('text/plain', String(props.task.id));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
</script>

<template>
    <article
        :data-task-id="task.id"
        draggable="true"
        class="card group cursor-grab p-3.5 transition hover:border-ink-300 hover:shadow-md active:cursor-grabbing dark:hover:border-ink-600"
        :class="{ 'opacity-40': dragging }"
        @dragstart="onDragStart"
        @dragend="draggingId = null"
    >
        <div class="flex items-start gap-3">
            <input
                type="checkbox"
                class="check mt-0.5"
                :class="{ 'check-pop': popping }"
                :checked="done"
                :aria-label="done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`"
                @change="(pop(), emit('toggle', task))"
            />
            <button class="min-w-0 flex-1 cursor-pointer text-left" @click="emit('open', task)">
                <span
                    class="block text-sm leading-snug font-medium break-words"
                    :class="{ 'text-ink-600 line-through dark:text-ink-400': done }"
                    >{{ task.title }}</span
                >
                <span
                    v-if="task.description"
                    class="mt-1 line-clamp-2 block text-xs leading-relaxed break-words text-ink-600 dark:text-ink-400"
                    >{{ task.description }}</span
                >
            </button>
        </div>

        <div v-if="task.labels.length" class="mt-2.5 flex flex-wrap gap-1 pl-[30px]">
            <LabelChip v-for="l in task.labels.slice(0, MAX_LABELS)" :key="l.id" :label="l" />
            <span v-if="task.labels.length > MAX_LABELS" class="px-1 text-xs text-ink-600 dark:text-ink-400"
                >+{{ task.labels.length - MAX_LABELS }}</span
            >
        </div>

        <div
            v-if="task.checklist.length"
            class="mt-2.5 flex items-center gap-2 pl-[30px] text-xs text-ink-600 dark:text-ink-400"
        >
            <span class="tabular-nums" :title="`${checklistDone} of ${task.checklist.length} checklist items done`"
                >{{ checklistDone }}/{{ task.checklist.length }}</span
            >
            <span class="h-1 flex-1 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700" role="presentation">
                <span
                    class="block h-full rounded-full bg-emerald-500 transition-all"
                    :style="{ width: `${checklistPct}%` }"
                />
            </span>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[30px]">
            <PriorityTag :priority="task.priority" />
            <TaskMeta :task="task" :checklist="false" />
        </div>
    </article>
</template>
