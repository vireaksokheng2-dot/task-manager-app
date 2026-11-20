import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import TaskRow from '@/components/TaskRow.vue';
import type { Task } from '@/types';

const base: Task = {
    id: 7,
    title: 'Renew passport',
    description: null,
    status: 'todo',
    priority: 'urgent',
    recurrence: 'none',
    due_at: null,
    remind_at: '2030-01-01T09:00:00Z',
    reminded_at: null,
    completed_at: null,
    position: 0,
    labels: [],
    checklist: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

const render = (overrides: Partial<Task> = {}, props: Record<string, unknown> = {}) =>
    mount(TaskRow, { props: { task: { ...base, ...overrides }, ...props } });

describe('TaskRow', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('reveals snooze options and emits the chosen time, then collapses', async () => {
        const w = render();
        expect(w.find('[role=group]').exists()).toBe(false);

        await w.get('button[aria-label^="Snooze reminder"]').trigger('click');
        const options = w.findAll('[role=group] button');
        expect(options.length).toBeGreaterThanOrEqual(3);

        const before = Date.now();
        await options[0].trigger('click'); // "10 minutes"
        const [task, until] = w.emitted('snooze')![0] as [Task, Date];
        expect(task.id).toBe(7);
        expect(until.getTime() - before).toBeGreaterThan(9 * 60_000);
        expect(w.find('[role=group]').exists()).toBe(false);
    });

    it('offers snooze only while a reminder exists on an open task', () => {
        expect(render({ remind_at: null }).find('button[aria-label^="Snooze"]').exists()).toBe(false);
        expect(render({ status: 'done' }).find('button[aria-label^="Snooze"]').exists()).toBe(false);
    });

    it('shows the status select only when asked and emits changes', async () => {
        expect(render().find('select').exists()).toBe(false);
        const w = render({}, { showStatus: true });
        await w.get('select').setValue('done');
        expect(w.emitted('status')![0]).toEqual([expect.objectContaining({ id: 7 }), 'done']);
    });
});
