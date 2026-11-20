export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Label {
    id: number;
    name: string;
    color: string;
    tasks_count?: number;
}

export interface ChecklistItem {
    id: number;
    title: string;
    is_done: boolean;
}

export interface Task {
    id: number;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    recurrence: Recurrence;
    due_at: string | null;
    remind_at: string | null;
    reminded_at: string | null;
    completed_at: string | null;
    position: number;
    labels: Label[];
    checklist: ChecklistItem[];
    created_at: string;
    updated_at: string;
}

/** Item as sent to the API: `id` is present for existing items only. */
export interface ChecklistInput {
    id?: number;
    title: string;
    is_done: boolean;
}

export interface TaskInput {
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    recurrence: Recurrence;
    due_at: string | null;
    remind_at: string | null;
    label_ids: number[];
    checklist: ChecklistInput[];
}

export interface User {
    id: number;
    name: string;
    email: string;
    timezone: string;
    email_reminders: boolean;
}

export interface AppNotification {
    id: string;
    type: string;
    message: string;
    task_id: number | null;
    /** Live summary of the task; null for non-task notifications. */
    task: { title: string; priority: TaskPriority; due_at: string | null } | null;
    created_at: string;
}

export const STATUSES: { value: TaskStatus; label: string }[] = [
    { value: 'todo', label: 'To do' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'done', label: 'Done' },
];

export const PRIORITIES: { value: TaskPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

export const RECURRENCES: { value: Recurrence; label: string }[] = [
    { value: 'none', label: 'Does not repeat' },
    { value: 'daily', label: 'Every day' },
    { value: 'weekly', label: 'Every week' },
    { value: 'monthly', label: 'Every month' },
];
