import type { TaskPriority } from '@/types';

export const priorityLabels: Record<TaskPriority, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
};

/** Dot colour per priority. The text beside it stays neutral, so contrast never depends on the hue. */
export const priorityDots: Record<TaskPriority, string> = {
    low: 'bg-ink-400',
    medium: 'bg-sky-500',
    high: 'bg-amber-500',
    urgent: 'bg-red-600',
};

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
