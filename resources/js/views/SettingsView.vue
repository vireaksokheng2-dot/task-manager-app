<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import LabelChip from '@/components/LabelChip.vue';
import { ApiError } from '@/lib/api';
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme';
import { useAuthStore } from '@/stores/auth';
import { useLabelStore } from '@/stores/labels';
import { useNotificationStore } from '@/stores/notifications';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';

const auth = useAuthStore();
const labels = useLabelStore();
const notifications = useNotificationStore();
const toasts = useToastStore();
const router = useRouter();

// ---- profile -------------------------------------------------------------
const profile = reactive({
    name: auth.user?.name ?? '',
    email: auth.user?.email ?? '',
    timezone: auth.user?.timezone ?? 'UTC',
});
const profileErrors = ref<Record<string, string[]>>({});
const profileBusy = ref(false);

const timezones = computed(() => {
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones];
});

async function saveProfile() {
    profileBusy.value = true;
    profileErrors.value = {};
    try {
        await auth.updateProfile({ name: profile.name, email: profile.email, timezone: profile.timezone });
        toasts.push('Profile saved', 'success', 2500);
    } catch (e) {
        if (e instanceof ApiError) profileErrors.value = e.errors;
        toasts.push(
            e instanceof Error && !(e instanceof ApiError && Object.keys(e.errors).length)
                ? e.message
                : 'Please fix the highlighted fields.',
            'error',
        );
    } finally {
        profileBusy.value = false;
    }
}

// ---- preferences ---------------------------------------------------------
const theme = ref<ThemeMode>(getThemeMode());
function chooseTheme(mode: ThemeMode) {
    theme.value = mode;
    setThemeMode(mode);
}

async function setEmailReminders(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    try {
        await auth.updateProfile({ email_reminders: checked });
    } catch (e) {
        (event.target as HTMLInputElement).checked = !checked;
        toasts.push(e instanceof Error ? e.message : 'Could not save the preference.', 'error');
    }
}

// ---- labels --------------------------------------------------------------
const newLabel = ref('');
const newColor = ref('#6366f1');
const labelError = ref('');
const editing = reactive<{ id: number | null; name: string; color: string }>({ id: null, name: '', color: '#6366f1' });

async function addLabel() {
    labelError.value = '';
    try {
        await labels.create(newLabel.value.trim(), newColor.value);
        newLabel.value = '';
    } catch (e) {
        labelError.value =
            e instanceof ApiError ? (e.first('name') ?? e.first('color') ?? e.message) : 'Could not create the label.';
    }
}

function startEdit(id: number, name: string, color: string) {
    Object.assign(editing, { id, name, color });
    labelError.value = '';
}

async function saveEdit() {
    if (editing.id === null) return;
    try {
        await labels.update(editing.id, { name: editing.name.trim(), color: editing.color });
        editing.id = null;
    } catch (e) {
        labelError.value =
            e instanceof ApiError ? (e.first('name') ?? e.first('color') ?? e.message) : 'Could not save the label.';
    }
}

async function removeLabel(id: number, name: string, count: number | undefined) {
    const used = count
        ? ` It is used by ${count} task${count === 1 ? '' : 's'}; they will keep existing but lose this label.`
        : '';
    if (!window.confirm(`Delete the label “${name}”?${used}`)) return;
    try {
        await labels.remove(id);
    } catch (e) {
        toasts.push(e instanceof Error ? e.message : 'Could not delete the label.', 'error');
    }
}

// ---- password ------------------------------------------------------------
const pw = reactive({ current: '', next: '', confirm: '' });
const pwErrors = ref<Record<string, string[]>>({});
const pwBusy = ref(false);

async function changePassword() {
    pwBusy.value = true;
    pwErrors.value = {};
    try {
        await auth.changePassword(pw.current, pw.next, pw.confirm);
        Object.assign(pw, { current: '', next: '', confirm: '' });
        toasts.push('Password changed. Other devices were signed out.', 'success', 4000);
    } catch (e) {
        if (e instanceof ApiError) pwErrors.value = e.errors;
        else toasts.push('Could not change the password.', 'error');
    } finally {
        pwBusy.value = false;
    }
}

// ---- danger zone ---------------------------------------------------------
const confirming = ref(false);
const deletePassword = ref('');
const deleteError = ref('');
const deleteBusy = ref(false);

async function deleteAccount() {
    deleteBusy.value = true;
    deleteError.value = '';
    try {
        notifications.stop();
        await auth.deleteAccount(deletePassword.value);
        useTaskStore().reset();
        labels.reset();
        await router.push({ name: 'register' });
    } catch (e) {
        deleteError.value =
            e instanceof ApiError ? (e.first('password') ?? e.message) : 'Could not delete the account.';
        notifications.start();
    } finally {
        deleteBusy.value = false;
    }
}

onMounted(() => {
    notifications.start();
    if (!labels.loaded) void labels.fetchAll().catch(() => undefined);
});

const themes: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];
</script>

<template>
    <div class="min-h-screen">
        <AppHeader @open-task="(id) => router.push({ name: 'tasks', query: { task: id } })" />

        <main id="main" class="mx-auto max-w-2xl space-y-6 px-4 py-8">
            <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>

            <!-- Profile -->
            <section class="card p-5" aria-labelledby="s-profile">
                <h2 id="s-profile" class="text-base font-semibold">Profile</h2>
                <form class="mt-4 space-y-4" @submit.prevent="saveProfile">
                    <div>
                        <label class="label" for="p-name">Name</label>
                        <input
                            id="p-name"
                            v-model="profile.name"
                            class="field"
                            required
                            maxlength="255"
                            autocomplete="name"
                        />
                        <p v-if="profileErrors.name" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ profileErrors.name[0] }}
                        </p>
                    </div>
                    <div>
                        <label class="label" for="p-email">Email</label>
                        <input
                            id="p-email"
                            v-model="profile.email"
                            type="email"
                            class="field"
                            required
                            autocomplete="email"
                        />
                        <p v-if="profileErrors.email" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ profileErrors.email[0] }}
                        </p>
                    </div>
                    <div>
                        <label class="label" for="p-tz">Time zone</label>
                        <select id="p-tz" v-model="profile.timezone" class="field">
                            <option v-for="z in timezones" :key="z" :value="z">{{ z }}</option>
                        </select>
                        <p class="mt-1 text-xs text-ink-600 dark:text-ink-400">
                            Used for times in reminder emails and for scheduling recurring tasks.
                        </p>
                        <p v-if="profileErrors.timezone" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ profileErrors.timezone[0] }}
                        </p>
                    </div>
                    <button class="btn btn-primary" :disabled="profileBusy">
                        {{ profileBusy ? 'Saving…' : 'Save profile' }}
                    </button>
                </form>
            </section>

            <!-- Preferences -->
            <section class="card p-5" aria-labelledby="s-prefs">
                <h2 id="s-prefs" class="text-base font-semibold">Preferences</h2>
                <div class="mt-4 space-y-5">
                    <fieldset>
                        <legend class="label">Appearance</legend>
                        <div
                            class="inline-flex rounded-lg border border-ink-300 p-0.5 dark:border-ink-700"
                            role="group"
                        >
                            <button
                                v-for="t in themes"
                                :key="t.value"
                                type="button"
                                class="btn !px-3 !py-1"
                                :class="theme === t.value ? 'bg-ink-200 dark:bg-ink-800' : 'btn-ghost'"
                                :aria-pressed="theme === t.value"
                                @click="chooseTheme(t.value)"
                            >
                                {{ t.label }}
                            </button>
                        </div>
                    </fieldset>

                    <label class="flex cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            class="mt-1 h-4 w-4 accent-accent-600"
                            :checked="auth.user?.email_reminders"
                            @change="setEmailReminders"
                        />
                        <span>
                            <span class="block text-sm font-medium">Email me reminders</span>
                            <span class="block text-xs text-ink-600 dark:text-ink-400"
                                >In-app reminders always appear; this controls the extra email.</span
                            >
                        </span>
                    </label>

                    <div>
                        <span class="label">Desktop notifications</span>
                        <p
                            v-if="notifications.permission === 'granted'"
                            class="text-sm text-emerald-700 dark:text-emerald-400"
                        >
                            Enabled in this browser.
                        </p>
                        <p
                            v-else-if="notifications.permission === 'denied'"
                            class="text-sm text-ink-600 dark:text-ink-400"
                        >
                            Blocked — allow notifications for this site in your browser settings.
                        </p>
                        <p
                            v-else-if="notifications.permission === 'unsupported'"
                            class="text-sm text-ink-600 dark:text-ink-400"
                        >
                            Not supported by this browser.
                        </p>
                        <button
                            v-else
                            type="button"
                            class="btn btn-ghost border border-ink-300 dark:border-ink-700"
                            @click="notifications.requestPermission()"
                        >
                            Enable desktop alerts
                        </button>
                    </div>
                </div>
            </section>

            <!-- Labels -->
            <section class="card p-5" aria-labelledby="s-labels">
                <h2 id="s-labels" class="text-base font-semibold">Labels</h2>
                <ul v-if="labels.labels.length" class="mt-4 divide-y divide-ink-200 dark:divide-ink-800">
                    <li v-for="l in labels.labels" :key="l.id" class="flex flex-wrap items-center gap-2 py-2.5">
                        <template v-if="editing.id === l.id">
                            <input
                                v-model="editing.color"
                                type="color"
                                class="h-8 w-9 cursor-pointer rounded border border-ink-300 bg-transparent p-0.5 dark:border-ink-700"
                                aria-label="Label colour"
                            />
                            <input
                                v-model="editing.name"
                                class="field !w-auto flex-1 !py-1"
                                maxlength="40"
                                aria-label="Label name"
                                @keydown.enter.prevent="saveEdit"
                                @keydown.esc="editing.id = null"
                            />
                            <button class="btn btn-primary !py-1" @click="saveEdit">Save</button>
                            <button class="btn btn-ghost !py-1" @click="editing.id = null">Cancel</button>
                        </template>
                        <template v-else>
                            <LabelChip :label="l" />
                            <span class="text-xs text-ink-600 dark:text-ink-400"
                                >{{ l.tasks_count ?? 0 }} task{{ l.tasks_count === 1 ? '' : 's' }}</span
                            >
                            <span class="ml-auto flex gap-1">
                                <button
                                    class="btn btn-ghost !py-1"
                                    :aria-label="`Edit label ${l.name}`"
                                    @click="startEdit(l.id, l.name, l.color)"
                                >
                                    Edit
                                </button>
                                <button
                                    class="btn btn-danger !py-1"
                                    :aria-label="`Delete label ${l.name}`"
                                    @click="removeLabel(l.id, l.name, l.tasks_count)"
                                >
                                    Delete
                                </button>
                            </span>
                        </template>
                    </li>
                </ul>
                <p v-else class="mt-3 text-sm text-ink-600 dark:text-ink-400">No labels yet.</p>

                <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="addLabel">
                    <input
                        v-model="newColor"
                        type="color"
                        class="h-9 w-10 cursor-pointer rounded border border-ink-300 bg-transparent p-0.5 dark:border-ink-700"
                        aria-label="New label colour"
                    />
                    <input
                        v-model="newLabel"
                        class="field !w-auto min-w-40 flex-1"
                        maxlength="40"
                        placeholder="New label name"
                        aria-label="New label name"
                    />
                    <button class="btn btn-primary" :disabled="!newLabel.trim()">Add label</button>
                </form>
                <p v-if="labelError" class="mt-2 text-xs text-red-700 dark:text-red-400" role="alert">
                    {{ labelError }}
                </p>
            </section>

            <!-- Password -->
            <section class="card p-5" aria-labelledby="s-password">
                <h2 id="s-password" class="text-base font-semibold">Password</h2>
                <form class="mt-4 space-y-4" @submit.prevent="changePassword">
                    <div>
                        <label class="label" for="pw-current">Current password</label>
                        <input
                            id="pw-current"
                            v-model="pw.current"
                            type="password"
                            class="field"
                            autocomplete="current-password"
                            required
                        />
                        <p v-if="pwErrors.current_password" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ pwErrors.current_password[0] }}
                        </p>
                    </div>
                    <div>
                        <label class="label" for="pw-new">New password</label>
                        <input
                            id="pw-new"
                            v-model="pw.next"
                            type="password"
                            class="field"
                            autocomplete="new-password"
                            minlength="8"
                            required
                        />
                        <p v-if="pwErrors.password" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ pwErrors.password[0] }}
                        </p>
                    </div>
                    <div>
                        <label class="label" for="pw-confirm">Confirm new password</label>
                        <input
                            id="pw-confirm"
                            v-model="pw.confirm"
                            type="password"
                            class="field"
                            autocomplete="new-password"
                            required
                        />
                    </div>
                    <button class="btn btn-primary" :disabled="pwBusy">
                        {{ pwBusy ? 'Updating…' : 'Change password' }}
                    </button>
                </form>
            </section>

            <!-- Danger zone -->
            <section class="card border-red-200 p-5 dark:border-red-900/60" aria-labelledby="s-danger">
                <h2 id="s-danger" class="text-base font-semibold text-red-700 dark:text-red-400">Delete account</h2>
                <p class="mt-1 text-sm text-ink-600 dark:text-ink-400">
                    Permanently removes your account, tasks and labels. This cannot be undone.
                </p>
                <button
                    v-if="!confirming"
                    class="btn btn-danger mt-3 border border-red-200 dark:border-red-900"
                    @click="confirming = true"
                >
                    Delete my account…
                </button>
                <form v-else class="mt-3 space-y-3" @submit.prevent="deleteAccount">
                    <div>
                        <label class="label" for="del-pw">Confirm with your password</label>
                        <input
                            id="del-pw"
                            v-model="deletePassword"
                            type="password"
                            class="field"
                            autocomplete="current-password"
                            required
                        />
                        <p v-if="deleteError" class="mt-1 text-xs text-red-700 dark:text-red-400" role="alert">
                            {{ deleteError }}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn bg-red-600 text-white hover:bg-red-500" :disabled="deleteBusy">
                            {{ deleteBusy ? 'Deleting…' : 'Permanently delete' }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-ghost"
                            @click="
                                confirming = false;
                                deletePassword = '';
                                deleteError = '';
                            "
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </section>
        </main>
    </div>
</template>
