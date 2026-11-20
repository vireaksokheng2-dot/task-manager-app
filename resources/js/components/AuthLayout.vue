<script setup lang="ts">
import BrandMark from '@/components/BrandMark.vue';
import Icon from '@/components/Icon.vue';

defineProps<{ title: string; subtitle: string }>();
</script>

<template>
    <main class="flex min-h-screen items-center justify-center p-4">
        <div class="w-full max-w-sm">
            <div class="mb-7 flex flex-col items-center text-center">
                <BrandMark :size="44" class="mb-4" />
                <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
                <p class="mt-1.5 text-sm text-ink-600 dark:text-ink-400">{{ subtitle }}</p>
            </div>
            <div class="card p-6 shadow-md"><slot /></div>
            <p class="mt-5 text-center text-sm text-ink-600 dark:text-ink-400"><slot name="footer" /></p>
            <p
                class="mt-8 flex items-center justify-center gap-1.5 text-xs text-ink-600 dark:text-ink-400"
                aria-hidden="true"
            >
                <Icon name="bell" :size="12" />Reminders in the app, on your desktop and by email
            </p>
        </div>
    </main>
</template>
