import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/stores/notifications';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';
import type { AppNotification } from '@/types';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);

const n = (id: string): AppNotification => ({
    id,
    type: 'task_reminder',
    message: `Reminder ${id}`,
    task_id: 1,
    task: { title: 'Task', priority: 'medium', due_at: null },
    created_at: '2026-03-10T00:00:00Z',
});

/** Serves each /notifications poll from a queue; anything else (e.g. /tasks) returns an empty list. */
function serve(...polls: AppNotification[][]) {
    const queue = [...polls];
    mockApi.mockImplementation(async (path: string) => {
        if (path === '/notifications') return { data: queue.length > 1 ? queue.shift()! : queue[0] };
        return { data: [] };
    });
}

describe('notification store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        mockApi.mockReset();
    });

    it('summarises the backlog on first load instead of toasting each reminder', async () => {
        serve([n('a'), n('b')]);
        const store = useNotificationStore();
        const toasts = useToastStore();

        await store.fetchUnread();

        expect(store.unreadCount).toBe(2);
        expect(toasts.toasts).toHaveLength(1);
        expect(toasts.toasts[0].message).toContain('2 unread reminders');
    });

    it('toasts only reminders it has not seen before', async () => {
        serve([n('a')], [n('a'), n('b')], [n('a'), n('b')]);
        const store = useNotificationStore();
        const toasts = useToastStore();

        await store.fetchUnread();
        toasts.toasts = [];

        await store.fetchUnread();
        expect(toasts.toasts.map((t) => t.message)).toEqual(['Reminder b']);

        await store.fetchUnread();
        expect(toasts.toasts).toHaveLength(1); // no repeat
    });

    it('refreshes tasks when a new reminder arrives, but not when nothing is new', async () => {
        serve([n('a')], [n('a')], [n('a'), n('b')]);
        const store = useNotificationStore();
        const refresh = vi.spyOn(useTaskStore(), 'refresh').mockResolvedValue(undefined);

        await store.fetchUnread(); // backlog: counts as new
        expect(refresh).toHaveBeenCalledTimes(1);

        await store.fetchUnread(); // same reminder again: nothing new
        expect(refresh).toHaveBeenCalledTimes(1);

        await store.fetchUnread(); // b is new
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('marks one and all as read optimistically', async () => {
        serve([n('a'), n('b')]);
        const store = useNotificationStore();
        await store.fetchUnread();
        mockApi.mockResolvedValue(undefined);

        await store.markRead('a');
        expect(store.items.map((i) => i.id)).toEqual(['b']);
        expect(mockApi).toHaveBeenCalledWith('/notifications/a/read', { method: 'POST' });

        await store.markAllRead();
        expect(store.unreadCount).toBe(0);
    });

    it('swallows transient polling errors', async () => {
        mockApi.mockRejectedValue(new Error('offline'));
        const store = useNotificationStore();
        await expect(store.fetchUnread()).resolves.toBeUndefined();
    });

    it('offers a one-tap snooze on live reminder toasts and clears the inbox entry', async () => {
        serve([], [n('a')]);
        const store = useNotificationStore();
        const toasts = useToastStore();
        await store.fetchUnread(); // first load: empty backlog
        await store.fetchUnread(); // 'a' arrives live

        const toast = toasts.toasts.find((t) => t.kind === 'reminder')!;
        expect(toast.action?.label).toBe('Snooze 10 min');

        mockApi.mockImplementation(async (path: string) => {
            if (path === '/tasks/1/snooze') return { data: { id: 1 } };
            return { data: [] };
        });
        await toast.action!.run();

        const call = mockApi.mock.calls.find(([p]) => p === '/tasks/1/snooze')!;
        expect(call[1]).toMatchObject({ method: 'POST' });
        const until = new Date((call[1]!.body as { until: string }).until).getTime();
        expect(until - Date.now()).toBeGreaterThan(9 * 60_000);
        expect(until - Date.now()).toBeLessThanOrEqual(10 * 60_000);
        expect(store.items.find((i) => i.id === 'a')).toBeUndefined();
        expect(toasts.toasts.some((t) => t.message === 'Snoozed for 10 minutes')).toBe(true);
    });

    it('snoozing a task removes all of its reminders from the inbox', async () => {
        serve([n('a'), { ...n('b'), task_id: 2 }]);
        const store = useNotificationStore();
        await store.fetchUnread();
        mockApi.mockResolvedValue({ data: { id: 1 } });

        await store.snoozeTask(1, new Date(Date.now() + 3_600_000));

        expect(store.items.map((i) => i.id)).toEqual(['b']);
        expect(useTaskStore().tasks.find((t) => t.id === 1)).toBeDefined(); // replaced from the response
    });
});
