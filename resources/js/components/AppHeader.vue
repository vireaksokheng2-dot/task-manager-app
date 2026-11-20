<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandMark from '@/components/BrandMark.vue';
import Icon, { type IconName } from '@/components/Icon.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme';
import { initials } from '@/lib/ui';
import { useAuthStore } from '@/stores/auth';
import { useLabelStore } from '@/stores/labels';
import { useNotificationStore } from '@/stores/notifications';
import { useTaskStore } from '@/stores/tasks';

const emit = defineEmits<{ openTask: [id: number] }>();

const auth = useAuthStore();
const router = useRouter();
const mode = ref<ThemeMode>(getThemeMode());

const next: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const modeLabel = computed(() => ({ system: 'System theme', light: 'Light theme', dark: 'Dark theme' })[mode.value]);
const modeIcon = computed<IconName>(() => ({ system: 'monitor', light: 'sun', dark: 'moon' })[mode.value] as IconName);

function cycleTheme() {
    mode.value = next[mode.value];
    setThemeMode(mode.value);
}

async function logout() {
    useNotificationStore().stop();
    useTaskStore().reset();
    useLabelStore().reset();
    await auth.logout();
    await router.push({ name: 'login' });
}

const linkClass =
    'rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-200/60 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-100';
const activeClass = '!bg-ink-200/70 !text-ink-900 dark:!bg-ink-800 dark:!text-white';
</script>

<template>
    <header
        class="sticky top-0 z-30 border-b border-ink-200 bg-ink-50/85 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/85"
    >
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
            <RouterLink to="/" class="group flex items-center gap-2.5 rounded-lg" aria-label="Taskly home">
                <BrandMark :size="30" />
                <span class="text-[17px] font-semibold tracking-tight">Taskly</span>
            </RouterLink>

            <nav class="ml-2 flex items-center gap-0.5" aria-label="Main">
                <RouterLink :to="{ name: 'tasks' }" :class="linkClass" :active-class="activeClass">Tasks</RouterLink>
                <RouterLink :to="{ name: 'settings' }" :class="linkClass" :active-class="activeClass"
                    >Settings</RouterLink
                >
            </nav>

            <div class="ml-auto flex items-center gap-1">
                <button
                    class="btn btn-ghost !px-2.5"
                    :aria-label="`${modeLabel} (click to change)`"
                    :title="modeLabel"
                    @click="cycleTheme"
                >
                    <Icon :name="modeIcon" :size="18" />
                </button>
                <NotificationBell @open-task="emit('openTask', $event)" />
                <span
                    class="ml-1 hidden size-8 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-800 sm:flex dark:bg-accent-900 dark:text-accent-100"
                    aria-hidden="true"
                    >{{ initials(auth.user?.name ?? '') }}</span
                >
                <span class="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{{ auth.user?.name }}</span>
                <button class="btn btn-ghost !px-2.5 sm:!px-3" @click="logout">
                    <Icon name="logout" :size="16" /><span class="hidden sm:inline">Log out</span
                    ><span class="sr-only sm:hidden">Log out</span>
                </button>
            </div>
        </div>
    </header>
</template>
