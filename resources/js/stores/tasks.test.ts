import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useTaskStore } from '@/stores/tasks';
import type { Task } from '@/types';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);

let id = 0;
function task(overrides: Partial<Task> = {}): Task {
    id += 1;
    return {
        id,
        title: `Task ${id}`,
        description: null,
        status: 'todo',
        priority: 'medium',
        recurrence: 'none',
        due_at: null,
        remind_at: null,
        reminded_at: null,
        completed_at: null,
        position: 0,
        labels: [],
        checklist: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

describe('task store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        mockApi.mockReset();
        id = 0;
    });

    it('loads tasks and groups them by status ordered by position', async () => {
        const a = task({ position: 1 });
        const b = task({ position: 0 });
        const c = task({ status: 'done' });
        mockApi.mockResolvedValue({ data: [a, b, c] });

        const store = useTaskStore();
        await store.fetchAll();

        expect(store.loaded).toBe(true);
        expect(store.columns.todo.map((t) => t.id)).toEqual([b.id, a.id]);
        expect(store.columns.done.map((t) => t.id)).toEqual([c.id]);
        expect(store.stats).toMatchObject({ total: 3, open: 2, done: 1 });
    });

    it('records a load error instead of throwing', async () => {
        mockApi.mockRejectedValue(new Error('boom'));
        const store = useTaskStore();
        await store.fetchAll();
        expect(store.loadError).toBe('boom');
        expect(store.loaded).toBe(false);
    });

    it('counts overdue and due-today tasks, excluding finished ones', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-10T05:00:00Z'));
        mockApi.mockResolvedValue({
            data: [
                task({ due_at: '2026-03-09T05:00:00Z' }), // overdue
                task({ due_at: '2026-03-09T05:00:00Z', status: 'done' }), // finished: not overdue
                task({ due_at: '2026-03-10T10:00:00Z' }), // today, not overdue yet
            ],
        });
        const store = useTaskStore();
        await store.fetchAll();
        expect(store.stats.overdue).toBe(1);
        expect(store.stats.dueToday).toBe(1);
        vi.useRealTimers();
    });

    it('adds a task on create', async () => {
        const created = task({ title: 'New' });
        mockApi.mockResolvedValue({ data: created });
        const store = useTaskStore();

        await store.create({ title: 'New' });

        expect(mockApi).toHaveBeenCalledWith('/tasks', { method: 'POST', body: { title: 'New' } });
        expect(store.tasks).toHaveLength(1);
    });

    it('replaces the task on update and adds a spawned recurrence', async () => {
        const a = task({ recurrence: 'daily' });
        const store = useTaskStore();
        store.tasks = [a];
        const done = { ...a, status: 'done' as const };
        const next = task({ recurrence: 'daily' });
        mockApi.mockResolvedValue({ data: done, spawned: next });

        const res = await store.update(a.id, { status: 'done' });

        expect(res.spawned?.id).toBe(next.id);
        expect(store.tasks.map((t) => t.id).sort()).toEqual([a.id, next.id].sort());
        expect(store.tasks.find((t) => t.id === a.id)?.status).toBe('done');
    });

    it('removes optimistically-confirmed deletes and can restore them', async () => {
        const a = task();
        const store = useTaskStore();
        store.tasks = [a];
        mockApi.mockResolvedValueOnce(undefined);

        const removed = await store.remove(a.id);
        expect(removed?.id).toBe(a.id);
        expect(store.tasks).toHaveLength(0);

        mockApi.mockResolvedValueOnce({ data: a });
        await store.restore(a.id);
        expect(mockApi).toHaveBeenLastCalledWith(`/tasks/${a.id}/restore`, { method: 'POST' });
        expect(store.tasks).toHaveLength(1);
    });

    describe('move', () => {
        it('reorders optimistically and adopts the server ordering', async () => {
            const a = task({ position: 0 });
            const b = task({ position: 1 });
            const c = task({ status: 'in_progress', position: 0 });
            const store = useTaskStore();
            store.tasks = [a, b, c];

            let optimistic: number[] = [];
            mockApi.mockImplementation(async () => {
                optimistic = store.columns.in_progress.map((t) => t.id); // state while the request is in flight
                return {
                    data: [
                        { ...b, position: 0 },
                        { ...a, status: 'in_progress', position: 0 },
                        { ...c, position: 1 },
                    ],
                };
            });

            await store.move(a.id, 'in_progress', 0);

            expect(optimistic).toEqual([a.id, c.id]);
            expect(mockApi).toHaveBeenCalledWith(`/tasks/${a.id}/move`, {
                method: 'POST',
                body: { status: 'in_progress', position: 0 },
            });
            expect(store.columns.in_progress.map((t) => t.id)).toEqual([a.id, c.id]);
        });

        it('rolls back when the server rejects the move', async () => {
            const a = task({ position: 0 });
            const store = useTaskStore();
            store.tasks = [a];
            mockApi.mockRejectedValue(new Error('nope'));

            await expect(store.move(a.id, 'done', 0)).rejects.toThrow('nope');

            expect(store.tasks[0].status).toBe('todo');
            expect(store.tasks[0].completed_at).toBeNull();
        });

        it('clamps an out-of-range index and ignores unknown tasks', async () => {
            const a = task();
            const b = task({ status: 'done' });
            const store = useTaskStore();
            store.tasks = [a, b];
            mockApi.mockResolvedValue({ data: [a, b] });

            await store.move(a.id, 'done', 99);
            expect(store.columns.done.map((t) => t.id)).toEqual([b.id, a.id]);

            mockApi.mockClear();
            await store.move(12345, 'done', 0);
            expect(mockApi).not.toHaveBeenCalled();
        });
    });
});

describe('task store refresh', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        mockApi.mockReset();
    });

    it('replaces the list silently, without touching loading flags', async () => {
        const store = useTaskStore();
        store.tasks = [task()];
        const updated = task({ reminded_at: '2026-03-10T00:00:00Z' });
        mockApi.mockResolvedValue({ data: [updated] });

        const loading: boolean[] = [];
        const stop = store.$subscribe(() => loading.push(store.loading));
        await store.refresh();
        stop();

        expect(store.tasks).toEqual([updated]);
        expect(loading.every((l) => l === false)).toBe(true);
    });

    it('keeps the current list when the refresh fails', async () => {
        const store = useTaskStore();
        const a = task();
        store.tasks = [a];
        mockApi.mockRejectedValue(new Error('offline'));

        await expect(store.refresh()).resolves.toBeUndefined();
        expect(store.tasks).toEqual([a]);
    });
});
