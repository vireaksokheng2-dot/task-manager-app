<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ value: number }>();

const shown = ref(props.value);
let frame = 0;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eases the displayed integer toward `value` so changes read as movement, not a jump. */
watch(
    () => props.value,
    (to) => {
        cancelAnimationFrame(frame);
        const from = shown.value;
        if (reduced() || from === to) {
            shown.value = to;
            return;
        }
        const start = performance.now();
        const duration = Math.min(700, 250 + Math.abs(to - from) * 40);
        const step = (t: number) => {
            const p = Math.min(1, (t - start) / duration);
            shown.value = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
            if (p < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
    },
);

onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
    <span class="tabular-nums">{{ shown }}</span>
</template>
