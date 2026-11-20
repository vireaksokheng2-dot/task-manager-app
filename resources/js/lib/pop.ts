import { ref } from 'vue';

/** Returns a flag that is true for ~450ms after `trigger()`; bind it to the `check-pop` class. */
export function usePop(ms = 450) {
    const popping = ref(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    function trigger() {
        popping.value = false;
        clearTimeout(timer);
        // Re-add on the next frame so the animation restarts if triggered twice quickly.
        requestAnimationFrame(() => {
            popping.value = true;
            timer = setTimeout(() => (popping.value = false), ms);
        });
    }
    return { popping, trigger };
}
