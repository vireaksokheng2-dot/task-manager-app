<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import Icon from '@/components/Icon.vue';
import TaskCard from '@/components/TaskCard.vue';
import { draggingId } from '@/lib/drag';
import type { Task, TaskStatus } from '@/types';

const props = defineProps<{ status: TaskStatus; label: string; tasks: Task[] }>();
const emit = defineEmits<{
    open: [task: Task];
    toggle: [task: Task];
    add: [status: TaskStatus];
    drop: [id: number, status: TaskStatus, index: number];
}>();

const list = useTemplateRef<HTMLElement>('list');
const dropIndex = ref<number | null>(null);

const dot = { todo: 'bg-ink-400', in_progress: 'bg-accent-500', done: 'bg-emerald-500' } as const;

/** Cards as they'd be laid out without the one being dragged. */
const others = computed(() => props.tasks.filter((t) => t.id !== draggingId.value));

function indexFromPointer(clientY: number): number {
    const cards = Array.from(list.value?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []).filter(
        (el) => Number(el.dataset.taskId) !== draggingId.value,
    );
    for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
}

function onDragOver(e: DragEvent) {
    if (draggingId.value === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropIndex.value = indexFromPointer(e.clientY);
}

function onDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropIndex.value = null;
}

function onDrop(e: DragEvent) {
    e.preventDefault();
    const id = draggingId.value;
    const index = indexFromPointer(e.clientY);
    dropIndex.value = null;
    draggingId.value = null;
    if (id !== null) emit('drop', id, props.status, index);
}

function lineBefore(task: Task): boolean {
    return dropIndex.value !== null && others.value[dropIndex.value]?.id === task.id;
}
</script>

<template>
    <section
        class="flex min-h-48 flex-col rounded-2xl border border-ink-200/70 bg-ink-100/70 p-2.5 transition dark:border-ink-800 dark:bg-ink-900/50"
        :class="{ 'ring-2 ring-accent-400/60': dropIndex !== null }"
        :aria-label="label"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <header class="mb-2.5 flex items-center justify-between px-1.5">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
                <span class="size-2.5 rounded-full" :class="dot[status]" aria-hidden="true" />
                {{ label }}
                <span
                    class="rounded-full bg-ink-200 px-1.5 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                    >{{ tasks.length }}</span
                >
            </h2>
            <button
                class="btn btn-ghost btn-sm !px-1.5"
                :aria-label="`Add task to ${label}`"
                @click="emit('add', status)"
            >
                <Icon name="plus" :size="16" />
            </button>
        </header>

        <div ref="list" class="flex flex-1 flex-col gap-2">
            <template v-for="t in tasks" :key="t.id">
                <div v-if="lineBefore(t)" class="h-1 shrink-0 rounded-full bg-accent-500" />
                <TaskCard :task="t" @open="emit('open', $event)" @toggle="emit('toggle', $event)" />
            </template>
            <div
                v-if="dropIndex !== null && others.length && dropIndex >= others.length"
                class="h-1 shrink-0 rounded-full bg-accent-500"
            />
            <!-- Stays mounted during a drag: removing the element under the cursor cancels the drop. -->
            <p
                v-if="!tasks.length"
                class="flex flex-1 items-center justify-center py-6 text-center text-xs text-ink-600 dark:text-ink-400"
            >
                {{ dropIndex !== null ? 'Drop here' : 'Nothing here yet' }}
            </p>
        </div>
    </section>
</template>
