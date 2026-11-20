/**
 * <TransitionGroup> hooks that make list items (rows, whole day groups) collapse smoothly when they
 * leave and expand when they arrive, instead of popping. Pass with `v-bind="collapse"`.
 * Under `prefers-reduced-motion` they finish immediately.
 */
const MS = 300;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TRANSITION = `max-height ${MS}ms ease, opacity ${MS - 50}ms ease, transform ${MS}ms ease, padding ${MS}ms ease, margin ${MS}ms ease`;

function reset(el: HTMLElement) {
    for (const p of [
        'maxHeight',
        'opacity',
        'transform',
        'paddingTop',
        'paddingBottom',
        'marginTop',
        'marginBottom',
        'overflow',
        'transition',
    ]) {
        el.style.removeProperty(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
    }
}

export const collapse = {
    css: false,
    onEnter(el: Element, done: () => void) {
        const e = el as HTMLElement;
        if (reduced()) return done();
        const height = e.offsetHeight;
        e.style.overflow = 'hidden';
        e.style.maxHeight = '0px';
        e.style.opacity = '0';
        e.style.paddingTop = e.style.paddingBottom = '0px';
        void e.offsetHeight; // commit the start state
        e.style.transition = TRANSITION;
        e.style.maxHeight = `${height}px`;
        e.style.opacity = '1';
        e.style.removeProperty('padding-top');
        e.style.removeProperty('padding-bottom');
        setTimeout(() => {
            reset(e);
            done();
        }, MS);
    },
    onLeave(el: Element, done: () => void) {
        const e = el as HTMLElement;
        if (reduced()) return done();
        e.style.overflow = 'hidden';
        e.style.maxHeight = `${e.offsetHeight}px`;
        void e.offsetHeight;
        e.style.transition = TRANSITION;
        e.style.maxHeight = '0px';
        e.style.opacity = '0';
        e.style.transform = 'translateX(12px)';
        e.style.paddingTop = e.style.paddingBottom = '0px';
        e.style.marginTop = e.style.marginBottom = '0px';
        setTimeout(done, MS);
    },
};
