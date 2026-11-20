<script setup lang="ts">
import { computed, onMounted, reactive, ref, useTemplateRef } from 'vue';
import Icon from '@/components/Icon.vue';
import { ApiError } from '@/lib/api';
import { fromLocalInput, inHours, leadBefore, REMINDER_LEADS, toLocalInput, tomorrowAt } from '@/lib/dates';
import { useFocusTrap } from '@/lib/focusTrap';
import { useLabelStore } from '@/stores/labels';
import { useTaskStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toasts';
import { PRIORITIES, RECURRENCES, STATUSES, type Task, type TaskStatus } from '@/types';

const props = defineProps<{ task: Task | null; initialStatus?: TaskStatus }>();
const emit = defineEmits<{ close: [] }>();

const store = useTaskStore();
const labelStore = useLabelStore();
const toasts = useToastStore();

interface Row {
    key: number;
    id?: number;
    title: string;
    is_done: boolean;
}

let rowKey = 0;
const toRow = (r: { id?: number; title: string; is_done: boolean }): Row => ({ key: rowKey++, ...r });

const form = reactive({
    title: props.task?.title ?? '',
    description: props.task?.description ?? '',
    status: props.task?.status ?? props.initialStatus ?? 'todo',
    priority: props.task?.priority ?? 'medium',
    recurrence: props.task?.recurrence ?? 'none',
    due: toLocalInput(props.task?.due_at ?? null),
    remind: toLocalInput(props.task?.remind_at ?? null),
    labelIds: (props.task?.labels ?? []).map((l) => l.id),
});
const checklist = ref<Row[]>((props.task?.checklist ?? []).map(toRow));
const newItem = ref('');
const newLabel = ref('');
const labelError = ref('');

const errors = ref<Record<string, string[]>>({});
const error = ref('');
const busy = ref(false);
const confirmDelete = ref(false);

const dialog = useTemplateRef<HTMLElement>('dialog');
const titleInput = useTemplateRef<HTMLInputElement>('titleInput');
const addItemInput = useTemplateRef<HTMLInputElement>('addItemInput');
useFocusTrap(dialog);

const reminderInPast = computed(() => !!form.remind && new Date(form.remind).getTime() < Date.now());
const reminderAfterDue = computed(
    () => !!form.remind && !!form.due && new Date(form.remind).getTime() > new Date(form.due).getTime(),
);
const chip = 'btn btn-outline btn-sm';
const chipOn = '!border-accent-500 !bg-accent-50 !text-accent-800 dark:!bg-accent-950 dark:!text-accent-200';
const leadActive = (minutes: number) => !!form.due && !!form.remind && form.remind === leadBefore(form.due, minutes);
const doneCount = computed(() => checklist.value.filter((r) => r.is_done).length);

function toggleLabel(id: number) {
    form.labelIds = form.labelIds.includes(id) ? form.labelIds.filter((x) => x !== id) : [...form.labelIds, id];
}

async function addLabel() {
    const name = newLabel.value.trim();
    if (!name) return;
    labelError.value = '';
    try {
        const label = await labelStore.create(name);
        form.labelIds.push(label.id);
        newLabel.value = '';
    } catch (e) {
        labelError.value = e instanceof ApiError ? (e.first('name') ?? e.message) : 'Could not create the label.';
    }
}

function addItem() {
    const title = newItem.value.trim();
    if (!title) return;
    checklist.value.push(toRow({ title, is_done: false }));
    newItem.value = '';
}

function moveItem(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= checklist.value.length) return;
    const rows = checklist.value;
    [rows[index], rows[target]] = [rows[target], rows[index]];
}

async function save() {
    if (!form.title.trim()) {
        errors.value = { title: ['Give your task a title.'] };
        titleInput.value?.focus();
        return;
    }
    busy.value = true;
    errors.value = {};
    error.value = '';

    // A half-typed checklist item shouldn't be lost on save.
    addItem();

    const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        recurrence: form.recurrence,
        due_at: fromLocalInput(form.due),
        remind_at: fromLocalInput(form.remind),
        label_ids: form.labelIds,
        checklist: checklist.value
            .filter((r) => r.title.trim())
            .map((r) => ({ ...(r.id ? { id: r.id } : {}), title: r.title.trim(), is_done: r.is_done })),
    };

    try {
        if (props.task) {
            const { spawned } = await store.update(props.task.id, payload);
            toasts.push(spawned ? 'Task completed — next occurrence created' : 'Task updated', 'success', 3000);
        } else {
            await store.create(payload);
            toasts.push('Task created', 'success', 2500);
        }
        emit('close');
    } catch (e) {
        if (e instanceof ApiError && Object.keys(e.errors).length) errors.value = e.errors;
        else error.value = e instanceof Error ? e.message : 'Something went wrong.';
    } finally {
        busy.value = false;
    }
}

async function remove() {
    if (!props.task) return;
    busy.value = true;
    const id = props.task.id;
    try {
        await store.remove(id);
        toasts.push('Task deleted', 'info', 8000, {
            label: 'Undo',
            run: async () => {
                try {
                    await store.restore(id);
                    toasts.push('Task restored', 'success', 2500);
                } catch {
                    toasts.push('Could not restore the task.', 'error');
                }
            },
        });
        emit('close');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not delete the task.';
        confirmDelete.value = false;
    } finally {
        busy.value = false;
    }
}

onMounted(() => titleInput.value?.focus());
</script>

<template>
    <div
        class="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        @mousedown.self="emit('close')"
        @keydown.esc="emit('close')"
    >
        <div
            ref="dialog"
            class="card animate-sheet-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 shadow-pop sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            :aria-label="task ? 'Edit task' : 'New task'"
        >
            <form @submit.prevent="save">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-semibold tracking-tight">{{ task ? 'Edit task' : 'New task' }}</h2>
                    <button type="button" class="btn btn-ghost !h-8 !px-2" aria-label="Close" @click="emit('close')">
                        <Icon name="x" :size="18" />
                    </button>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="label" for="t-title">Title</label>
                        <input
                            id="t-title"
                            ref="titleInput"
                            v-model="form.title"
                            class="field"
                            maxlength="255"
                            placeholder="What needs to be done?"
                            :aria-invalid="!!errors.title"
                            aria-describedby="t-title-err"
                        />
                        <p v-if="errors.title" id="t-title-err" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ errors.title[0] }}
                        </p>
                    </div>

                    <div>
                        <label class="label" for="t-desc">Description</label>
                        <textarea
                            id="t-desc"
                            v-model="form.description"
                            class="field"
                            rows="3"
                            maxlength="5000"
                            placeholder="Optional details…"
                        />
                        <p v-if="errors.description" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ errors.description[0] }}
                        </p>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="label" for="t-status">Status</label>
                            <select id="t-status" v-model="form.status" class="field">
                                <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="label" for="t-priority">Priority</label>
                            <select id="t-priority" v-model="form.priority" class="field">
                                <option v-for="p in PRIORITIES" :key="p.value" :value="p.value">{{ p.label }}</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label class="label" for="t-due">Due</label>
                            <input id="t-due" v-model="form.due" type="datetime-local" class="field" />
                            <p v-if="errors.due_at" class="mt-1 text-xs text-red-700 dark:text-red-400">
                                {{ errors.due_at[0] }}
                            </p>
                        </div>
                        <div>
                            <label class="label" for="t-remind">Remind me</label>
                            <input id="t-remind" v-model="form.remind" type="datetime-local" class="field" />
                            <p v-if="errors.remind_at" class="mt-1 text-xs text-red-700 dark:text-red-400">
                                {{ errors.remind_at[0] }}
                            </p>
                        </div>
                    </div>

                    <div class="-mt-1 space-y-1.5">
                        <div v-if="form.due" class="flex flex-wrap items-center gap-1.5">
                            <span class="w-[4.5rem] text-xs text-ink-600 dark:text-ink-400">Before due</span>
                            <button
                                v-for="lead in REMINDER_LEADS"
                                :key="lead.id"
                                type="button"
                                :class="[chip, leadActive(lead.minutes) && chipOn]"
                                :aria-pressed="leadActive(lead.minutes)"
                                @click="form.remind = leadBefore(form.due, lead.minutes)"
                            >
                                {{ lead.label }}
                            </button>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="w-[4.5rem] text-xs text-ink-600 dark:text-ink-400">Quick</span>
                            <button type="button" :class="chip" @click="form.remind = inHours(1)">in 1 hour</button>
                            <button type="button" :class="chip" @click="form.remind = tomorrowAt(9)">
                                tomorrow 9:00
                            </button>
                            <button v-if="form.remind" type="button" :class="chip" @click="form.remind = ''">
                                clear
                            </button>
                        </div>
                    </div>
                    <p v-if="reminderInPast" class="-mt-2 text-xs text-amber-700 dark:text-amber-400">
                        That time has passed — you'll be reminded within a minute of saving.
                    </p>
                    <p v-else-if="reminderAfterDue" class="-mt-2 text-xs text-amber-700 dark:text-amber-400">
                        The reminder is set after the due date.
                    </p>

                    <div>
                        <label class="label" for="t-repeat">Repeat</label>
                        <select id="t-repeat" v-model="form.recurrence" class="field">
                            <option v-for="r in RECURRENCES" :key="r.value" :value="r.value">{{ r.label }}</option>
                        </select>
                        <p v-if="form.recurrence !== 'none'" class="mt-1 text-xs text-ink-600 dark:text-ink-400">
                            When you complete this task, the next one is created automatically{{
                                form.due || form.remind ? '' : ' (add a due date or reminder to schedule it)'
                            }}.
                        </p>
                    </div>

                    <fieldset>
                        <legend class="label">Labels</legend>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <button
                                v-for="l in labelStore.labels"
                                :key="l.id"
                                type="button"
                                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition"
                                :class="
                                    form.labelIds.includes(l.id)
                                        ? 'border-accent-500 bg-accent-50 text-accent-900 dark:bg-accent-950 dark:text-accent-100'
                                        : 'border-ink-300 text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
                                "
                                :aria-pressed="form.labelIds.includes(l.id)"
                                @click="toggleLabel(l.id)"
                            >
                                <span
                                    class="h-2 w-2 rounded-full"
                                    :style="{ backgroundColor: l.color }"
                                    aria-hidden="true"
                                />{{ l.name }}
                            </button>
                            <span v-if="!labelStore.labels.length" class="text-xs text-ink-600 dark:text-ink-400"
                                >No labels yet — create one:</span
                            >
                        </div>
                        <div class="mt-2 flex gap-2">
                            <input
                                v-model="newLabel"
                                class="field !py-1.5"
                                maxlength="40"
                                placeholder="New label…"
                                aria-label="New label name"
                                @keydown.enter.prevent="addLabel"
                            />
                            <button
                                type="button"
                                class="btn btn-ghost !py-1.5"
                                :disabled="!newLabel.trim()"
                                @click="addLabel"
                            >
                                Add
                            </button>
                        </div>
                        <p v-if="labelError" class="mt-1 text-xs text-red-700 dark:text-red-400" role="alert">
                            {{ labelError }}
                        </p>
                    </fieldset>

                    <fieldset>
                        <legend class="label">
                            Checklist
                            <span v-if="checklist.length" class="font-normal tabular-nums"
                                >({{ doneCount }}/{{ checklist.length }})</span
                            >
                        </legend>
                        <ul v-if="checklist.length" class="mb-2 space-y-1.5">
                            <li v-for="(row, i) in checklist" :key="row.key" class="flex items-center gap-2">
                                <input
                                    v-model="row.is_done"
                                    type="checkbox"
                                    class="check check-sq"
                                    :aria-label="`Done: ${row.title}`"
                                />
                                <input
                                    v-model="row.title"
                                    class="field !py-1"
                                    :class="{ 'text-ink-600 line-through dark:text-ink-400': row.is_done }"
                                    maxlength="255"
                                    :aria-label="`Checklist item ${i + 1}`"
                                    @keydown.enter.prevent="addItemInput?.focus()"
                                />
                                <button
                                    type="button"
                                    class="btn btn-ghost !px-1.5 !py-1"
                                    :disabled="i === 0"
                                    :aria-label="`Move item ${i + 1} up`"
                                    @click="moveItem(i, -1)"
                                >
                                    <Icon name="chevron" :size="14" class="rotate-180" />
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-ghost !px-1.5 !py-1"
                                    :disabled="i === checklist.length - 1"
                                    :aria-label="`Move item ${i + 1} down`"
                                    @click="moveItem(i, 1)"
                                >
                                    <Icon name="chevron" :size="14" />
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-danger !px-1.5 !py-1"
                                    :aria-label="`Remove item ${i + 1}`"
                                    @click="checklist.splice(i, 1)"
                                >
                                    <Icon name="x" :size="14" />
                                </button>
                            </li>
                        </ul>
                        <div class="flex gap-2">
                            <input
                                ref="addItemInput"
                                v-model="newItem"
                                class="field !py-1.5"
                                maxlength="255"
                                placeholder="Add a checklist item…"
                                aria-label="New checklist item"
                                @keydown.enter.prevent="addItem"
                            />
                            <button
                                type="button"
                                class="btn btn-ghost !py-1.5"
                                :disabled="!newItem.trim()"
                                @click="addItem"
                            >
                                Add
                            </button>
                        </div>
                        <p v-if="errors.checklist" class="mt-1 text-xs text-red-700 dark:text-red-400">
                            {{ errors.checklist[0] }}
                        </p>
                    </fieldset>

                    <p v-if="error" class="text-sm text-red-700 dark:text-red-400" role="alert">{{ error }}</p>
                </div>

                <div
                    class="sticky -bottom-6 z-10 -mx-6 mt-6 -mb-6 flex items-center justify-between gap-2 border-t border-ink-200 bg-white px-6 py-4 dark:border-ink-800 dark:bg-ink-900"
                >
                    <div>
                        <template v-if="task">
                            <button
                                v-if="!confirmDelete"
                                type="button"
                                class="btn btn-danger"
                                :disabled="busy"
                                @click="confirmDelete = true"
                            >
                                Delete
                            </button>
                            <span v-else class="flex items-center gap-1">
                                <button
                                    type="button"
                                    class="btn btn-danger font-semibold"
                                    :disabled="busy"
                                    @click="remove"
                                >
                                    Really delete?
                                </button>
                                <button type="button" class="btn btn-ghost" @click="confirmDelete = false">No</button>
                            </span>
                        </template>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" class="btn btn-ghost" @click="emit('close')">Cancel</button>
                        <button class="btn btn-primary" :disabled="busy">
                            {{ busy ? 'Saving…' : task ? 'Save changes' : 'Create task' }}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </div>
</template>
