import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import TaskCard from '@/components/TaskCard.vue';
import type { Task } from '@/types';

const base: Task = {
    id: 1,
    title: 'Write report',
    description: 'Quarterly numbers',
    status: 'todo',
    priority: 'high',
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

const render = (overrides: Partial<Task> = {}) => mount(TaskCard, { props: { task: { ...base, ...overrides } } });

describe('TaskCard', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('shows title, description and priority', () => {
        const w = render();
        expect(w.text()).toContain('Write report');
        expect(w.text()).toContain('Quarterly numbers');
        expect(w.text()).toContain('High');
    });

    it('emits toggle from the checkbox and open from the title', async () => {
        const w = render();
        await w.get('input[type=checkbox]').trigger('change');
        await w.get('button').trigger('click');
        expect(w.emitted('toggle')).toHaveLength(1);
        expect(w.emitted('open')).toHaveLength(1);
    });

    it('strikes through finished tasks and checks the box', () => {
        const w = render({ status: 'done' });
        expect((w.get('input[type=checkbox]').element as HTMLInputElement).checked).toBe(true);
        expect(w.get('button span').classes()).toContain('line-through');
    });

    it('shows checklist progress', () => {
        const w = render({
            checklist: [
                { id: 1, title: 'a', is_done: true },
                { id: 2, title: 'b', is_done: false },
                { id: 3, title: 'c', is_done: true },
                { id: 4, title: 'd', is_done: false },
            ],
        });
        expect(w.text()).toContain('2/4');
        expect(w.find('[style*="width: 50%"]').exists()).toBe(true);
    });

    it('caps visible labels and shows the remainder', () => {
        const labels = ['a', 'b', 'c', 'd', 'e'].map((name, i) => ({ id: i + 1, name, color: '#6366f1' }));
        const w = render({ labels });
        expect(w.text()).toContain('+2');
        expect(w.text()).not.toContain('e\n');
    });

    it('flags an overdue due date but not for finished tasks', () => {
        const past = '2020-01-01T00:00:00Z';
        expect(render({ due_at: past }).find('[title="Overdue"]').exists()).toBe(true);
        expect(render({ due_at: past, status: 'done' }).find('[title="Overdue"]').exists()).toBe(false);
    });

    it('hides the reminder on finished tasks and marks sent ones', () => {
        const remind = '2030-01-01T00:00:00Z';
        expect(render({ remind_at: remind }).find('[title="Reminder scheduled"]').exists()).toBe(true);
        expect(render({ remind_at: remind, reminded_at: remind }).find('[title="Reminder sent"]').exists()).toBe(true);
        const finished = render({ remind_at: remind, status: 'done' });
        expect(finished.find('[title="Reminder scheduled"]').exists()).toBe(false);
        expect(finished.find('[title="Reminder sent"]').exists()).toBe(false);
    });

    it('labels recurring tasks', () => {
        expect(render({ recurrence: 'weekly' }).text()).toContain('weekly');
        expect(render().find('[title^="Repeats"]').exists()).toBe(false);
    });

    it('shows a live countdown only when due within two hours', () => {
        const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
        expect(
            render({ due_at: inMin(30) })
                .find('[title="Due soon"]')
                .text(),
        ).toMatch(/^in (29|30) min$/);
        expect(
            render({ due_at: inMin(30), status: 'done' })
                .find('[title="Due soon"]')
                .exists(),
        ).toBe(false);
        expect(
            render({ due_at: inMin(300) })
                .find('[title="Due soon"]')
                .exists(),
        ).toBe(false);
        expect(
            render({ due_at: inMin(-30) })
                .find('[title="Due soon"]')
                .exists(),
        ).toBe(false);
    });
});
