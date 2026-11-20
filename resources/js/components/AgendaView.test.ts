import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgendaView from '@/components/AgendaView.vue';
import type { Task } from '@/types';

const base: Task = {
    id: 1,
    title: 'T',
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
};
const at = (d: number, h = 9) => new Date(2026, 10, 20 + d, h).toISOString();
const task = (id: number, o: Partial<Task> = {}): Task => ({ ...base, id, title: `Task ${id}`, ...o });

const headings = (tasks: Task[]) =>
    mount(AgendaView, { props: { tasks } })
        .findAll('h2')
        .map((h) => h.text());

describe('AgendaView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 20, 15, 0)); // Friday 15:00 local
    });
    afterEach(() => vi.useRealTimers());

    it('groups open tasks by day and leaves out finished ones', () => {
        const h = headings([
            task(1, { due_at: at(-2) }),
            task(2, { due_at: at(0, 18) }),
            task(3, { due_at: at(1) }),
            task(4, { due_at: at(0), status: 'done' }),
            task(5),
        ]);
        expect(h).toEqual(['Overdue', 'Today', 'Tomorrow', 'No date']);
    });

    it('does not call a task overdue just because its reminder already fired', () => {
        const h = headings([task(1, { remind_at: at(-2), reminded_at: at(-2) })]);
        expect(h).toEqual(['No date']);
    });

    it('places a dateless task by an upcoming reminder', () => {
        expect(headings([task(1, { remind_at: at(1, 8) })])).toEqual(['Tomorrow']);
    });

    it('shows a friendly empty state', () => {
        const w = mount(AgendaView, { props: { tasks: [task(1, { status: 'done' })] } });
        expect(w.text()).toContain("You're all caught up");
    });
});
