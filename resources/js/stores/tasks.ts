import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '@/lib/api';
import { isOverdue, isToday } from '@/lib/dates';
import type { Task, TaskInput, TaskStatus } from '@/types';

interface UpdateResponse {
    data: Task;
    /** Next occurrence, when completing a recurring task. */
    spawned: Task | null;
}

const byPosition = (a: Task, b: Task) => a.position - b.position || a.id - b.id;

export const useTaskStore = defineStore('tasks', () => {
    const tasks = ref<Task[]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const loadError = ref<string | null>(null);

    // Ticks so "overdue" states update while the page stays open.
    const now = ref(Date.now());
    setInterval(() => (now.value = Date.now()), 30_000);

    const columns = computed<Record<TaskStatus, Task[]>>(() => ({
        todo: tasks.value.filter((t) => t.status === 'todo').sort(byPosition),
        in_progress: tasks.value.filter((t) => t.status === 'in_progress').sort(byPosition),
        done: tasks.value.filter((t) => t.status === 'done').sort(byPosition),
    }));

    const stats = computed(() => ({
        total: tasks.value.length,
        open: tasks.value.filter((t) => t.status !== 'done').length,
        done: tasks.value.filter((t) => t.status === 'done').length,
        overdue: tasks.value.filter((t) => isOverdue(t.due_at, t.status === 'done', now.value)).length,
        dueToday: tasks.value.filter((t) => t.status !== 'done' && isToday(t.due_at)).length,
    }));

    async function fetchAll() {
        loading.value = true;
        loadError.value = null;
        try {
            tasks.value = (await api<{ data: Task[] }>('/tasks')).data;
            loaded.value = true;
        } catch (e) {
            loadError.value = e instanceof Error ? e.message : 'Failed to load tasks';
        } finally {
            loading.value = false;
        }
    }

    /**
     * Silent refetch (no loading state). Used when the server changed tasks behind our back,
     * e.g. a reminder fired and stamped `reminded_at`.
     */
    async function refresh() {
        try {
            tasks.value = (await api<{ data: Task[] }>('/tasks')).data;
        } catch {
            /* keep showing what we have; the next action or poll will retry */
        }
    }

    async function create(input: Partial<TaskInput> & { title: string }) {
        const { data } = await api<{ data: Task }>('/tasks', { method: 'POST', body: input });
        tasks.value.push(data);
        return data;
    }

    function replace(task: Task) {
        const i = tasks.value.findIndex((t) => t.id === task.id);
        if (i === -1) tasks.value.push(task);
        else tasks.value[i] = task;
    }

    async function update(id: number, input: Partial<TaskInput>) {
        const { data, spawned } = await api<UpdateResponse>(`/tasks/${id}`, { method: 'PATCH', body: input });
        replace(data);
        if (spawned) replace(spawned);
        return { task: data, spawned };
    }

    /** Pushes the reminder to `until`; the server re-arms it and clears the task's unread reminders. */
    async function snooze(id: number, until: Date) {
        const { data } = await api<{ data: Task }>(`/tasks/${id}/snooze`, {
            method: 'POST',
            body: { until: until.toISOString() },
        });
        replace(data);
        return data;
    }

    /** Soft-deletes on the server; returns the task so the caller can offer "Undo". */
    async function remove(id: number) {
        const task = tasks.value.find((t) => t.id === id);
        await api(`/tasks/${id}`, { method: 'DELETE' });
        tasks.value = tasks.value.filter((t) => t.id !== id);
        return task;
    }

    async function restore(id: number) {
        const { data } = await api<{ data: Task }>(`/tasks/${id}/restore`, { method: 'POST' });
        replace(data);
        return data;
    }

    /**
     * Drag & drop. Moves optimistically, then syncs with the server's ordering.
     * `index` is the target index within the column *excluding* the moved task.
     */
    async function move(id: number, status: TaskStatus, index: number) {
        const snapshot = tasks.value.map((t) => ({ ...t }));
        const task = tasks.value.find((t) => t.id === id);
        if (!task) return;

        const column = columns.value[status].filter((t) => t.id !== id);
        column.splice(Math.min(Math.max(index, 0), column.length), 0, task);

        task.completed_at = status === 'done' ? new Date().toISOString() : null;
        task.status = status;
        column.forEach((t, i) => (t.position = i));

        try {
            tasks.value = (
                await api<{ data: Task[] }>(`/tasks/${id}/move`, {
                    method: 'POST',
                    body: { status, position: index },
                })
            ).data;
        } catch (e) {
            tasks.value = snapshot;
            throw e;
        }
    }

    function reset() {
        tasks.value = [];
        loaded.value = false;
    }

    return {
        tasks,
        now,
        loading,
        loaded,
        loadError,
        columns,
        stats,
        fetchAll,
        refresh,
        create,
        update,
        remove,
        restore,
        snooze,
        move,
        reset,
    };
});
