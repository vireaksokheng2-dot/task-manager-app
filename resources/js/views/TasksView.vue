<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AgendaView from '@/components/AgendaView.vue';
import AnimatedNumber from '@/components/AnimatedNumber.vue';
import AppHeader from '@/components/AppHeader.vue';
import Icon, { type IconName } from '@/components/Icon.vue';
import KanbanColumn from '@/components/KanbanColumn.vue';
import QuickAdd from '@/components/QuickAdd.vue';
import TaskModal from '@/components/TaskModal.vue';
import TaskRow from '@/components/TaskRow.vue';
import { formatRelative, isOverdue } from '@/lib/dates';
import { collapse } from '@/lib/motion';
import { useAuthStore } from '@/stores/auth';
import { useLabelStore } from '@/stores/labels';
import { useNotificationStore } from '@/stores/notifications';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';
import { PRIORITIES, STATUSES, type Task, type TaskPriority, type TaskStatus } from '@/types';

const store = useTaskStore();
const labelStore = useLabelStore();
const notifications = useNotificationStore();
const auth = useAuthStore();
const toasts = useToastStore();
const route = useRoute();
const router = useRouter();
const searchInput = useTemplateRef<HTMLInputElement>('searchInput');
const quickAdd = useTemplateRef<InstanceType<typeof QuickAdd>>('quickAdd');

// --- view state -----------------------------------------------------------
type View = 'agenda' | 'board' | 'list';
const VIEW_KEY = 'taskly.view';
function initialView(): View {
    try {
        const saved = localStorage.getItem(VIEW_KEY);
        if (saved === 'agenda' || saved === 'board' || saved === 'list') return saved;
    } catch {
        /* ignore */
    }
    return 'agenda';
}
const view = ref<View>(initialView());
watch(view, (v) => {
    try {
        localStorage.setItem(VIEW_KEY, v);
    } catch {
        /* ignore */
    }
});

const VIEWS: { value: View; label: string; icon: IconName }[] = [
    { value: 'agenda', label: 'Agenda', icon: 'agenda' },
    { value: 'board', label: 'Board', icon: 'board' },
    { value: 'list', label: 'List', icon: 'list' },
];

const search = ref('');
const priority = ref<TaskPriority | 'all'>('all');
const onlyOverdue = ref(false);
const labelFilter = ref<number | 'all'>('all');

const modal = ref<{ task: Task | null; status?: TaskStatus } | null>(null);

// --- derived --------------------------------------------------------------
function matches(t: Task): boolean {
    const q = search.value.trim().toLowerCase();
    if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false;
    if (priority.value !== 'all' && t.priority !== priority.value) return false;
    if (labelFilter.value !== 'all' && !t.labels.some((l) => l.id === labelFilter.value)) return false;
    if (onlyOverdue.value && !isOverdue(t.due_at, t.status === 'done', store.now)) return false;
    return true;
}

const columns = computed(() => STATUSES.map((s) => ({ ...s, tasks: store.columns[s.value].filter(matches) })));

const filtered = computed(() => store.tasks.filter(matches));

const listTasks = computed(() => {
    const dueKey = (t: Task) => (t.due_at ? new Date(t.due_at).getTime() : Infinity);
    return [...filtered.value].sort(
        (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || dueKey(a) - dueKey(b) || a.id - b.id,
    );
});

const filtersActive = computed(
    () => !!search.value || priority.value !== 'all' || onlyOverdue.value || labelFilter.value !== 'all',
);
const visibleCount = computed(() => filtered.value.length);

function clearFilters() {
    search.value = '';
    priority.value = 'all';
    onlyOverdue.value = false;
    labelFilter.value = 'all';
}

// Rows slide/fade in and collapse out, so completing or snoozing a task reads as an event.
const rowMotion = collapse;

// --- header ---------------------------------------------------------------
const greeting = computed(() => {
    const hour = new Date(store.now).getHours();
    const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const first = auth.user?.name?.trim().split(/\s+/)[0];
    return first ? `${part}, ${first}` : part;
});
const todayLabel = computed(() =>
    new Date(store.now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
);
const summaryLine = computed(() => {
    const { overdue, dueToday, open } = store.stats;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    if (overdue && dueToday) return `${plural(overdue, 'task')} overdue and ${dueToday} due today.`;
    if (overdue) return `${plural(overdue, 'task')} overdue.`;
    if (dueToday) return `${plural(dueToday, 'task')} due today.`;
    return open ? 'Nothing is due today.' : 'You have nothing open.';
});

const summary = computed(() => [
    { label: 'Open', value: store.stats.open, tone: '' },
    { label: 'Due today', value: store.stats.dueToday, tone: 'text-amber-700 dark:text-amber-400' },
    { label: 'Overdue', value: store.stats.overdue, tone: store.stats.overdue ? 'text-red-700 dark:text-red-400' : '' },
    { label: 'Completed', value: store.stats.done, tone: 'text-emerald-700 dark:text-emerald-400' },
]);

// --- actions --------------------------------------------------------------
const openNew = (status?: TaskStatus) => (modal.value = { task: null, status });
const openTask = (task: Task) => (modal.value = { task });

function openTaskById(id: number) {
    const task = store.tasks.find((t) => t.id === id);
    if (task) openTask(task);
    else toasts.push('That task no longer exists.', 'info');
}

async function toggle(task: Task) {
    try {
        await store.update(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
    } catch (e) {
        toasts.push(e instanceof Error ? e.message : 'Could not update the task.', 'error');
    }
}

async function setStatus(task: Task, status: TaskStatus) {
    try {
        await store.update(task.id, { status });
    } catch (e) {
        toasts.push(e instanceof Error ? e.message : 'Could not update the task.', 'error');
    }
}

async function snooze(task: Task, until: Date) {
    try {
        await store.snooze(task.id, until);
        notifications.forgetTask(task.id);
        toasts.push(`Snoozed until ${formatRelative(until.toISOString())}`, 'success', 3000);
    } catch (e) {
        toasts.push(e instanceof Error ? e.message : 'Could not snooze the reminder.', 'error');
    }
}

async function onDrop(id: number, status: TaskStatus, index: number) {
    try {
        await store.move(id, status, index);
    } catch (e) {
        toasts.push(e instanceof Error ? e.message : 'Could not move the task.', 'error');
    }
}

function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (modal.value || e.metaKey || e.ctrlKey || e.altKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
    if (e.key === 'n') {
        e.preventDefault();
        openNew();
    } else if (e.key === 'a') {
        e.preventDefault();
        quickAdd.value?.focus();
    } else if (e.key === '/') {
        e.preventDefault();
        searchInput.value?.focus();
    }
}

onMounted(async () => {
    notifications.start();
    document.addEventListener('keydown', onKey);

    await Promise.all([store.fetchAll(), labelStore.fetchAll().catch(() => undefined)]);

    // Arrived from a reminder link on another page: /?task=ID
    const wanted = Number(route.query.task);
    if (wanted) {
        openTaskById(wanted);
        await router.replace({ name: 'tasks' });
    }
});
onBeforeUnmount(() => {
    notifications.stop();
    document.removeEventListener('keydown', onKey);
});
</script>

<template>
    <div class="min-h-screen">
        <AppHeader @open-task="openTaskById" />

        <main id="main" class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <h1 class="sr-only">Your tasks</h1>

            <!-- hero -->
            <div class="rise mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                    <p class="eyebrow">{{ todayLabel }}</p>
                    <p class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{{ greeting }}</p>
                    <p v-if="store.loaded" class="mt-1 text-sm text-ink-600 dark:text-ink-400">{{ summaryLine }}</p>
                </div>
                <button class="btn btn-primary" aria-keyshortcuts="n" title="Shortcut: n" @click="openNew()">
                    <Icon name="plus" :size="16" />New task
                </button>
            </div>

            <!-- summary -->
            <section
                class="card rise mb-6 grid grid-cols-2 divide-ink-200 sm:grid-cols-4 sm:divide-x dark:divide-ink-800"
                style="--d: 70ms"
                aria-label="Summary"
            >
                <div
                    v-for="(s, i) in summary"
                    :key="s.label"
                    class="px-5 py-4"
                    :class="{ 'border-t border-ink-200 sm:border-t-0 dark:border-ink-800': i > 1 }"
                >
                    <div class="text-xs font-medium text-ink-600 dark:text-ink-400">{{ s.label }}</div>
                    <div class="mt-0.5 text-2xl font-semibold" :class="s.tone"><AnimatedNumber :value="s.value" /></div>
                </div>
            </section>

            <QuickAdd ref="quickAdd" class="rise mb-6" style="--d: 140ms" />

            <!-- toolbar -->
            <div class="rise mb-5 flex flex-wrap items-center gap-2" style="--d: 200ms">
                <div class="relative w-full sm:w-60">
                    <Icon
                        name="search"
                        :size="16"
                        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500 dark:text-ink-400"
                    />
                    <input
                        ref="searchInput"
                        v-model="search"
                        type="search"
                        class="field !pl-9"
                        placeholder="Search…  ( / )"
                        aria-label="Search tasks"
                    />
                </div>
                <select v-model="priority" class="field !w-auto" aria-label="Filter by priority">
                    <option value="all">All priorities</option>
                    <option v-for="p in PRIORITIES" :key="p.value" :value="p.value">{{ p.label }}</option>
                </select>
                <select
                    v-if="labelStore.labels.length"
                    v-model="labelFilter"
                    class="field !w-auto"
                    aria-label="Filter by label"
                >
                    <option value="all">All labels</option>
                    <option v-for="l in labelStore.labels" :key="l.id" :value="l.id">{{ l.name }}</option>
                </select>
                <label class="flex cursor-pointer items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                    <input v-model="onlyOverdue" type="checkbox" class="check check-sq" /> Overdue only
                </label>

                <div
                    class="ml-auto flex rounded-lg border border-ink-300 bg-white p-0.5 shadow-sm dark:border-ink-700 dark:bg-ink-900"
                    role="group"
                    aria-label="View"
                >
                    <button
                        v-for="v in VIEWS"
                        :key="v.value"
                        class="btn !h-8 !px-2.5"
                        :class="
                            view === v.value
                                ? 'bg-accent-50 text-accent-800 dark:bg-accent-950 dark:text-accent-200'
                                : 'btn-ghost'
                        "
                        :aria-pressed="view === v.value"
                        @click="view = v.value"
                    >
                        <Icon :name="v.icon" :size="16" /><span class="hidden sm:inline">{{ v.label }}</span
                        ><span class="sr-only sm:hidden">{{ v.label }}</span>
                    </button>
                </div>
            </div>

            <!-- states -->
            <p
                v-if="store.loadError"
                class="card flex items-center justify-between gap-3 p-4 text-sm text-red-700 dark:text-red-400"
                role="alert"
            >
                {{ store.loadError }}
                <button class="btn btn-outline" @click="store.fetchAll()">Retry</button>
            </p>

            <div
                v-else-if="!store.loaded"
                class="grid gap-4 md:grid-cols-3"
                aria-busy="true"
                aria-label="Loading tasks"
            >
                <div v-for="n in 3" :key="n" class="space-y-2 rounded-2xl bg-ink-100/80 p-2.5 dark:bg-ink-900/60">
                    <div class="skeleton h-5 w-24 rounded bg-ink-200 dark:bg-ink-800" />
                    <div
                        v-for="m in 3 - (n % 2)"
                        :key="m"
                        class="skeleton h-20 rounded-xl bg-ink-200/70 dark:bg-ink-800/70"
                    />
                </div>
            </div>

            <template v-else>
                <div v-if="!store.tasks.length" class="card flex flex-col items-center px-6 py-16 text-center">
                    <span
                        class="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
                    >
                        <Icon name="bell-ring" :size="22" />
                    </span>
                    <h2 class="text-lg font-semibold">No tasks yet</h2>
                    <p class="mt-1 max-w-sm text-sm text-ink-600 dark:text-ink-400">
                        Add a task with a due date and a reminder, and Taskly will nudge you at the right moment. Try
                        typing “Call the dentist tomorrow 9am” above.
                    </p>
                    <button class="btn btn-primary mt-6" @click="openNew()">Create a task</button>
                </div>

                <div v-else-if="filtersActive && !visibleCount" class="py-16 text-center">
                    <p class="text-sm text-ink-600 dark:text-ink-400">No tasks match your filters.</p>
                    <button class="btn btn-outline mt-3" @click="clearFilters">Clear filters</button>
                </div>

                <AgendaView
                    v-else-if="view === 'agenda'"
                    :tasks="filtered"
                    @open="openTask"
                    @toggle="toggle"
                    @status="setStatus"
                    @snooze="snooze"
                />

                <!-- board -->
                <div v-else-if="view === 'board'" class="grid items-start gap-4 md:grid-cols-3">
                    <KanbanColumn
                        v-for="c in columns"
                        :key="c.value"
                        :status="c.value"
                        :label="c.label"
                        :tasks="c.tasks"
                        @open="openTask"
                        @toggle="toggle"
                        @add="openNew"
                        @drop="onDrop"
                    />
                </div>

                <!-- list -->
                <TransitionGroup
                    v-else
                    tag="ul"
                    v-bind="rowMotion"
                    class="card divide-y divide-ink-200 overflow-hidden dark:divide-ink-800"
                >
                    <TaskRow
                        v-for="t in listTasks"
                        :key="t.id"
                        :task="t"
                        show-status
                        @open="openTask"
                        @toggle="toggle"
                        @status="setStatus"
                        @snooze="snooze"
                    />
                </TransitionGroup>
            </template>
        </main>

        <TaskModal
            v-if="modal"
            :key="modal.task?.id ?? 'new'"
            :task="modal.task"
            :initial-status="modal.status"
            @close="modal = null"
        />
    </div>
</template>
