<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import PriorityTag from '@/components/PriorityTag.vue';
import SnoozeOptions from '@/components/SnoozeOptions.vue';
import { formatDistance, formatRelative } from '@/lib/dates';
import { useNotificationStore } from '@/stores/notifications';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';
import type { AppNotification } from '@/types';

const emit = defineEmits<{ openTask: [id: number] }>();
const notifications = useNotificationStore();
const tasks = useTaskStore();
const toasts = useToastStore();

const open = ref(false);
const ringing = ref(false);

// A new reminder rings the bell once; going down (read/snoozed) stays quiet.
watch(
    () => notifications.unreadCount,
    (now, before) => {
        if (now <= before) return;
        ringing.value = false;
        requestAnimationFrame(() => (ringing.value = true));
        setTimeout(() => (ringing.value = false), 1000);
    },
);
const snoozingId = ref<string | null>(null);
const busyId = ref<string | null>(null);
const root = useTemplateRef<HTMLElement>('root');
const trigger = useTemplateRef<HTMLButtonElement>('trigger');

function close(returnFocus = false) {
    open.value = false;
    snoozingId.value = null;
    if (returnFocus) trigger.value?.focus();
}

function onDocClick(e: MouseEvent) {
    if (open.value && root.value && !root.value.contains(e.target as Node)) close();
}
function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open.value) {
        e.stopPropagation();
        close(true);
    }
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

async function openItem(n: AppNotification) {
    close();
    if (n.task_id !== null) emit('openTask', n.task_id);
    await notifications.markRead(n.id);
}

async function act(n: AppNotification, run: () => Promise<void>, failure: string) {
    busyId.value = n.id;
    try {
        await run();
    } catch (e) {
        toasts.push(e instanceof Error && e.message ? e.message : failure, 'error');
    } finally {
        busyId.value = null;
        snoozingId.value = null;
    }
}

const snooze = (n: AppNotification, until: Date) =>
    act(
        n,
        async () => {
            await notifications.snoozeTask(n.task_id!, until);
            toasts.push(`Snoozed until ${formatRelative(until.toISOString())}`, 'success', 3000);
        },
        'Could not snooze the reminder.',
    );

const complete = (n: AppNotification) =>
    act(
        n,
        async () => {
            await tasks.update(n.task_id!, { status: 'done' });
            notifications.forgetTask(n.task_id!);
            toasts.push('Marked as done', 'success', 2500);
        },
        'Could not complete the task.',
    );
</script>

<template>
    <div ref="root" class="relative" @keydown="onKeydown">
        <button
            ref="trigger"
            class="btn btn-ghost relative !px-2.5"
            aria-label="Reminders"
            aria-haspopup="true"
            :aria-expanded="open"
            @click="open ? close() : (open = true)"
        >
            <Icon
                :name="notifications.unreadCount ? 'bell-ring' : 'bell'"
                :size="18"
                class="origin-top"
                :class="{ 'animate-ring': ringing }"
            />
            <span
                v-if="notifications.unreadCount"
                :key="notifications.unreadCount"
                class="animate-badge-pop absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-ink-950"
                >{{ notifications.unreadCount }}</span
            >
        </button>

        <div
            v-if="open"
            class="popover animate-pop-in absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden"
        >
            <div class="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-800">
                <h2 class="text-sm font-semibold">Reminders</h2>
                <button
                    v-if="notifications.unreadCount"
                    class="text-xs font-medium text-accent-700 hover:underline dark:text-accent-300"
                    @click="notifications.markAllRead()"
                >
                    Clear all
                </button>
            </div>

            <ul class="max-h-[26rem] divide-y divide-ink-200 overflow-y-auto dark:divide-ink-800">
                <li v-for="n in notifications.items" :key="n.id" class="px-4 py-3">
                    <button class="block w-full cursor-pointer text-left" @click="openItem(n)">
                        <span class="eyebrow block !text-[10px]">Reminder · {{ formatDistance(n.created_at) }}</span>
                        <span class="mt-0.5 block text-sm leading-snug font-medium">{{
                            n.task?.title ?? n.message
                        }}</span>
                        <span v-if="n.task" class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <PriorityTag :priority="n.task.priority" />
                            <span
                                v-if="n.task.due_at"
                                class="inline-flex items-center gap-1 text-xs text-ink-600 tabular-nums dark:text-ink-400"
                            >
                                <Icon name="calendar" :size="12" />Due {{ formatRelative(n.task.due_at) }}
                            </span>
                        </span>
                    </button>

                    <div v-if="n.task_id !== null" class="mt-2.5 flex items-center gap-1.5">
                        <button
                            class="btn btn-outline btn-sm"
                            :disabled="busyId === n.id"
                            :aria-label="`Mark “${n.task?.title ?? 'task'}” as done`"
                            @click="complete(n)"
                        >
                            <Icon name="check" :size="14" />Done
                        </button>
                        <button
                            class="btn btn-ghost btn-sm"
                            :disabled="busyId === n.id"
                            :aria-expanded="snoozingId === n.id"
                            :aria-label="`Snooze “${n.task?.title ?? 'task'}”`"
                            @click="snoozingId = snoozingId === n.id ? null : n.id"
                        >
                            <Icon name="snooze" :size="14" />Snooze
                        </button>
                        <button
                            class="btn btn-ghost btn-sm ml-auto"
                            :aria-label="`Dismiss reminder for ${n.task?.title ?? 'task'}`"
                            @click="notifications.markRead(n.id)"
                        >
                            Dismiss
                        </button>
                    </div>
                    <div v-else class="mt-2">
                        <button class="btn btn-ghost btn-sm" @click="notifications.markRead(n.id)">Dismiss</button>
                    </div>

                    <div v-if="snoozingId === n.id" class="mt-2.5">
                        <SnoozeOptions @pick="snooze(n, $event)" />
                    </div>
                </li>

                <li v-if="!notifications.items.length" class="flex flex-col items-center px-4 py-10 text-center">
                    <span
                        class="mb-3 flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                    >
                        <Icon name="bell" :size="18" />
                    </span>
                    <p class="text-sm font-medium">No new reminders</p>
                    <p class="mt-0.5 text-xs text-ink-600 dark:text-ink-400">Reminders appear here when they're due.</p>
                </li>
            </ul>

            <div v-if="notifications.permission === 'default'" class="border-t border-ink-200 p-2 dark:border-ink-800">
                <button class="btn btn-ghost w-full !text-xs" @click="notifications.requestPermission()">
                    <Icon name="bell-ring" :size="14" />Enable desktop alerts
                </button>
            </div>
            <p
                v-else-if="notifications.permission === 'denied'"
                class="border-t border-ink-200 p-3 text-center text-xs text-ink-600 dark:border-ink-800 dark:text-ink-400"
            >
                Desktop alerts are blocked in your browser.
            </p>
        </div>
    </div>
</template>
