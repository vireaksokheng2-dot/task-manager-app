import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToastHost from '@/components/ToastHost.vue';
import { useToastStore } from '@/stores/toasts';

describe('ToastHost', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
    });

    it('renders toasts and auto-dismisses them', async () => {
        const toasts = useToastStore();
        const w = mount(ToastHost);

        toasts.push('Saved', 'success', 1000);
        await w.vm.$nextTick();
        expect(w.text()).toContain('Saved');

        vi.advanceTimersByTime(1001);
        await w.vm.$nextTick();
        expect(w.text()).not.toContain('Saved');
        vi.useRealTimers();
    });

    it('runs a toast action once and dismisses the toast', async () => {
        const toasts = useToastStore();
        const run = vi.fn();
        const w = mount(ToastHost);

        toasts.push('Task deleted', 'info', 0, { label: 'Undo', run });
        await w.vm.$nextTick();
        await w
            .findAll('button')
            .find((b) => b.text() === 'Undo')!
            .trigger('click');

        expect(run).toHaveBeenCalledOnce();
        expect(toasts.toasts).toHaveLength(0);
        vi.useRealTimers();
    });

    it('uses role=alert for errors so screen readers announce them', async () => {
        const toasts = useToastStore();
        const w = mount(ToastHost);
        toasts.push('Failed', 'error', 0);
        await w.vm.$nextTick();
        expect(w.find('[role=alert]').exists()).toBe(true);
        vi.useRealTimers();
    });
});
