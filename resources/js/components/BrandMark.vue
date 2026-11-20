<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 32 });
</script>

<template>
    <span
        class="inline-flex shrink-0 items-center justify-center rounded-[28%] bg-accent-600 text-white shadow-sm"
        :style="{ width: `${size}px`, height: `${size}px` }"
        aria-hidden="true"
    >
        <svg
            :width="size * 0.62"
            :height="size * 0.62"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="origin-top group-hover:animate-ring"
        >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            <path d="m9.2 11 2.1 2.1 3.6-3.8" stroke-width="2.2" />
        </svg>
    </span>
</template>
