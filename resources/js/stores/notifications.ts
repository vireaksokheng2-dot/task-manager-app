import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { api } from '@/lib/api';
import { setUnreadBadge } from '@/lib/pageTitle';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';
import type { AppNotification } from '@/types';

const POLL_MS = 20_000;

export const useNotificationStore = defineStore('notifications', () => {
    const items = ref<AppNotification[]>([]);
    const permission = ref<NotificationPermission | 'unsupported'>(
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    );
    const unreadCount = computed(() => items.value.length);
    watch(unreadCount, setUnreadBadge);

    let timer: ReturnType<typeof setInterval> | null = null;
    let seen = new Set<string>();
    let firstLoad = true;

    async function fetchUnread() {
        try {
            const { data } = await api<{ data: AppNotification[] }>('/notifications');
            const fresh = data.filter((n) => !seen.has(n.id));
            data.forEach((n) => seen.add(n.id));
            items.value = data;

            // Don't blast toasts for backlog on first load - the bell already shows it.
            if (!firstLoad) fresh.forEach(announce);
            else if (fresh.length) {
                useToastStore().push(
                    `You have ${fresh.length} unread reminder${fresh.length > 1 ? 's' : ''}.`,
                    'reminder',
                );
            }
            firstLoad = false;

            // A fired reminder changes its task (reminded_at), so keep the board in step.
            if (fresh.length) void useTaskStore().refresh();
        } catch {
            /* transient network errors are fine - try again next tick */
        }
    }

    function announce(n: AppNotification) {
        const toasts = useToastStore();
        toasts.push(
            n.message,
            'reminder',
            12_000,
            n.task_id === null
                ? undefined
                : {
                      label: 'Snooze 10 min',
                      run: async () => {
                          try {
                              await snoozeTask(n.task_id!, new Date(Date.now() + 10 * 60_000));
                              toasts.push('Snoozed for 10 minutes', 'success', 2500);
                          } catch {
                              toasts.push('Could not snooze the reminder.', 'error');
                          }
                      },
                  },
        );
        if (permission.value === 'granted') {
            try {
                new Notification('Taskly', { body: n.message, tag: n.id });
            } catch {
                /* some mobile browsers only allow service-worker notifications */
            }
        }
    }

    async function markRead(id: string) {
        items.value = items.value.filter((n) => n.id !== id);
        await api(`/notifications/${id}/read`, { method: 'POST' }).catch(() => fetchUnread());
    }

    /** Drops a task's reminders from the inbox (the server already did, or will on the next poll). */
    function forgetTask(taskId: number) {
        items.value = items.value.filter((n) => n.task_id !== taskId);
    }

    async function snoozeTask(taskId: number, until: Date) {
        await useTaskStore().snooze(taskId, until);
        forgetTask(taskId);
    }

    async function markAllRead() {
        items.value = [];
        await api('/notifications/read-all', { method: 'POST' }).catch(() => fetchUnread());
    }

    async function requestPermission() {
        if (typeof Notification === 'undefined') return;
        permission.value = await Notification.requestPermission();
    }

    function start() {
        stop();
        firstLoad = true;
        seen = new Set();
        void fetchUnread();
        timer = setInterval(fetchUnread, POLL_MS);
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
        items.value = [];
    }

    return {
        items,
        unreadCount,
        permission,
        start,
        stop,
        fetchUnread,
        markRead,
        markAllRead,
        forgetTask,
        snoozeTask,
        requestPermission,
    };
});
