import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from '@/lib/focusTrap';

const Dialog = defineComponent({
    setup() {
        const el = ref<HTMLElement | null>(null);
        useFocusTrap(el);
        return () =>
            h('div', { ref: el }, [h('button', { id: 'first' }, 'first'), h('button', { id: 'last' }, 'last')]);
    },
});

function tab(shiftKey = false) {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    return e;
}

describe('useFocusTrap', () => {
    // jsdom has no layout, so offsetParent is null; pretend everything is visible.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { get: () => document.body });

    it('wraps focus forwards and backwards inside the dialog', () => {
        const w = mount(Dialog, { attachTo: document.body });
        const first = w.get('#first').element as HTMLElement;
        const last = w.get('#last').element as HTMLElement;

        last.focus();
        expect(tab().defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);

        expect(tab(true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);
        w.unmount();
    });

    it('locks page scroll while open and restores focus on close', () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();

        const w = mount(Dialog, { attachTo: document.body });
        expect(document.body.style.overflow).toBe('hidden');

        w.unmount();
        expect(document.body.style.overflow).toBe('');
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });
});
