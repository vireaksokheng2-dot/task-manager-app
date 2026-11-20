import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/lib/api';
import { useTaskStore } from '@/stores/tasks';
import type { Label } from '@/types';

export const useLabelStore = defineStore('labels', () => {
    const labels = ref<Label[]>([]);
    const loaded = ref(false);

    const sort = () => labels.value.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    async function fetchAll() {
        labels.value = (await api<{ data: Label[] }>('/labels')).data;
        loaded.value = true;
    }

    async function create(name: string, color?: string) {
        const { data } = await api<{ data: Label }>('/labels', {
            method: 'POST',
            body: { name, ...(color ? { color } : {}) },
        });
        labels.value.push(data);
        sort();
        return data;
    }

    async function update(id: number, input: { name?: string; color?: string }) {
        const { data } = await api<{ data: Label }>(`/labels/${id}`, { method: 'PATCH', body: input });
        labels.value = labels.value.map((l) => (l.id === id ? data : l));
        sort();

        // Keep the labels embedded in tasks in sync without a refetch.
        useTaskStore().tasks.forEach((t) => {
            t.labels = t.labels.map((l) => (l.id === id ? { ...l, name: data.name, color: data.color } : l));
        });
        return data;
    }

    async function remove(id: number) {
        await api(`/labels/${id}`, { method: 'DELETE' });
        labels.value = labels.value.filter((l) => l.id !== id);
        useTaskStore().tasks.forEach((t) => (t.labels = t.labels.filter((l) => l.id !== id)));
    }

    function reset() {
        labels.value = [];
        loaded.value = false;
    }

    return { labels, loaded, fetchAll, create, update, remove, reset };
});
