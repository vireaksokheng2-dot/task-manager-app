import { onBeforeUnmount, onMounted, type Ref } from 'vue';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab / Shift+Tab inside `container` while mounted, locks page scroll,
 * and returns focus to the element that opened the dialog when it closes.
 * Call from `setup()` so the opener is still the active element.
 */
export function useFocusTrap(container: Ref<HTMLElement | null>): void {
    const opener = document.activeElement as HTMLElement | null;

    function onKeydown(e: KeyboardEvent) {
        if (e.key !== 'Tab' || !container.value) return;

        const items = Array.from(container.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null,
        );
        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || !container.value.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !container.value.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    }

    onMounted(() => {
        document.addEventListener('keydown', onKeydown);
        document.body.style.overflow = 'hidden';
    });

    onBeforeUnmount(() => {
        document.removeEventListener('keydown', onKeydown);
        document.body.style.overflow = '';
        opener?.focus?.();
    });
}
