<script setup lang="ts">
import Icon, { type IconName } from '@/components/Icon.vue';
import { useToastStore, type Toast } from '@/stores/toasts';

const toasts = useToastStore();

const icons: Record<Toast['kind'], { name: IconName; tone: string }> = {
    info: { name: 'bell', tone: 'text-ink-600 dark:text-ink-300' },
    success: { name: 'check', tone: 'text-emerald-700 dark:text-emerald-400' },
    error: { name: 'x', tone: 'text-red-700 dark:text-red-400' },
    reminder: { name: 'bell-ring', tone: 'text-accent-700 dark:text-accent-300' },
};

async function runAction(t: Toast) {
    toasts.dismiss(t.id);
    await t.action?.run();
}
</script>

<template>
    <div
        class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
    >
        <TransitionGroup
            enter-active-class="transition duration-200"
            enter-from-class="translate-y-2 opacity-0"
            leave-active-class="transition duration-150"
            leave-to-class="opacity-0"
        >
            <div
                v-for="t in toasts.toasts"
                :key="t.id"
                class="popover pointer-events-auto flex w-full max-w-sm items-center gap-3 p-3 pl-4 text-sm"
                :role="t.kind === 'error' ? 'alert' : 'status'"
            >
                <Icon :name="icons[t.kind].name" :size="18" :class="icons[t.kind].tone" />
                <span class="flex-1 break-words">{{ t.message }}</span>
                <button
                    v-if="t.action"
                    class="shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-sm font-semibold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950"
                    @click="runAction(t)"
                >
                    {{ t.action.label }}
                </button>
                <button
                    class="shrink-0 cursor-pointer rounded-md p-1 text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
                    aria-label="Dismiss"
                    @click="toasts.dismiss(t.id)"
                >
                    <Icon name="x" :size="14" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>
