const pad = (n: number) => String(n).padStart(2, '0');

/** ISO string -> value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO string (UTC), or null when empty. */
export function fromLocalInput(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatDateTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function isOverdue(iso: string | null, done: boolean, now = Date.now()): boolean {
    return !!iso && !done && new Date(iso).getTime() < now;
}

export function isToday(iso: string | null): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    const n = new Date();
    return d.toDateString() === n.toDateString();
}

export function inHours(hours: number): string {
    return toLocalInput(new Date(Date.now() + hours * 3_600_000).toISOString());
}

export function tomorrowAt(hour: number): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return toLocalInput(d.toISOString());
}

// ---------------------------------------------------------------------------------------------
// Relative formatting, day grouping and snooze presets
// ---------------------------------------------------------------------------------------------

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole calendar days from `now` to `iso` in local time (negative = past). DST-safe. */
export function dayDiff(iso: string | Date, now: Date | number = Date.now()): number {
    const a = startOfDay(new Date(iso));
    const b = startOfDay(new Date(now));
    return Math.round(
        (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) /
            86_400_000,
    );
}

const timeOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Today, 5:00 PM" · "Tomorrow, 9:00 AM" · "Yesterday, 4:30 PM" · "Fri, 9:00 AM" · "Dec 5, 9:00 AM". */
export function formatRelative(iso: string, now: Date | number = Date.now()): string {
    const d = new Date(iso);
    const diff = dayDiff(d, now);
    const time = timeOf(d);
    if (diff === 0) return `Today, ${time}`;
    if (diff === 1) return `Tomorrow, ${time}`;
    if (diff === -1) return `Yesterday, ${time}`;
    if (diff > 1 && diff < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${time}`;
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    const date = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
    return `${date}, ${time}`;
}

/** "in 12 min" · "in 3 hr" · "2 days ago" … for how far away a moment is. */
export function formatDistance(iso: string, now: Date | number = Date.now()): string {
    const ms = new Date(iso).getTime() - new Date(now).getTime();
    const abs = Math.abs(ms);
    const min = Math.round(abs / 60_000);
    let text: string;
    if (min < 1) return 'now';
    if (min < 60) text = `${min} min`;
    else if (min < 60 * 24) text = `${Math.round(min / 60)} hr`;
    else {
        const days = Math.round(min / 1440);
        text = `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    return ms >= 0 ? `in ${text}` : `${text} ago`;
}

export type AgendaBucketKey = string;

export interface AgendaBucket<T> {
    key: AgendaBucketKey;
    title: string;
    /** Secondary text, e.g. the date next to "Today". */
    subtitle?: string;
    tone: 'overdue' | 'today' | 'normal';
    items: T[];
}

/**
 * Groups items by the calendar day of their `when` instant: Overdue (before today), Today, Tomorrow,
 * one bucket per day for the following 5 days, "Later", and "No date". Items keep their input order
 * within a bucket, so sort before calling. Empty buckets are omitted.
 */
export function groupByDay<T>(
    items: T[],
    when: (item: T) => string | null,
    now: Date | number = Date.now(),
): AgendaBucket<T>[] {
    const buckets = new Map<string, AgendaBucket<T>>();
    const today = new Date(now);

    const bucket = (key: string, title: string, tone: AgendaBucket<T>['tone'], subtitle?: string) => {
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { key, title, subtitle, tone, items: [] }));
        return b;
    };

    // Pre-seed in display order so Map iteration is already sorted.
    bucket('overdue', 'Overdue', 'overdue');
    bucket(
        'today',
        'Today',
        'today',
        today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    );
    bucket(
        'tomorrow',
        'Tomorrow',
        'normal',
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
        }),
    );

    for (const item of items) {
        const w = when(item);
        if (!w) {
            bucket('none', 'No date', 'normal').items.push(item);
            continue;
        }
        const diff = dayDiff(w, now);
        if (diff < 0) bucket('overdue', 'Overdue', 'overdue').items.push(item);
        else if (diff === 0) bucket('today', 'Today', 'today').items.push(item);
        else if (diff === 1) bucket('tomorrow', 'Tomorrow', 'normal').items.push(item);
        else if (diff <= 6) {
            const d = new Date(w);
            bucket(
                `d${diff}`,
                d.toLocaleDateString(undefined, { weekday: 'long' }),
                'normal',
                d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            ).items.push(item);
        } else bucket('later', 'Later', 'normal').items.push(item);
    }

    const order = (k: string) =>
        k === 'overdue'
            ? -1
            : k === 'today'
              ? 0
              : k === 'tomorrow'
                ? 1
                : k === 'later'
                  ? 100
                  : k === 'none'
                    ? 101
                    : Number(k.slice(1));
    return [...buckets.values()].filter((b) => b.items.length).sort((a, b) => order(a.key) - order(b.key));
}

export interface SnoozePreset {
    id: string;
    label: string;
    until: Date;
}

const at = (d: Date, days: number, hour: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, 0, 0, 0);

/** Quick "remind me again" options relative to `now`. "Later today" is offered only before 4 PM. */
export function snoozePresets(now: Date = new Date()): SnoozePreset[] {
    const presets: SnoozePreset[] = [
        { id: '10m', label: '10 minutes', until: new Date(now.getTime() + 10 * 60_000) },
        { id: '1h', label: '1 hour', until: new Date(now.getTime() + 60 * 60_000) },
    ];
    if (now.getHours() < 16) presets.push({ id: 'later', label: 'Later today', until: at(now, 0, 18) });
    presets.push({ id: 'tomorrow', label: 'Tomorrow', until: at(now, 1, 9) });
    if (now.getDay() !== 0) {
        // Next Monday is always 1-7 days away; Sunday's "tomorrow" already is Monday.
        const ahead = (8 - now.getDay()) % 7 || 7;
        presets.push({ id: 'monday', label: 'Next week', until: at(now, ahead, 9) });
    }
    return presets;
}

/** Reminder lead times relative to a due date, newest-first for the task form. */
export const REMINDER_LEADS = [
    { id: '0', label: 'At due time', minutes: 0 },
    { id: '10', label: '10 min before', minutes: 10 },
    { id: '60', label: '1 hour before', minutes: 60 },
    { id: '1440', label: '1 day before', minutes: 1440 },
] as const;

/** `datetime-local` value `minutes` before the given `datetime-local` due value. */
export function leadBefore(dueLocal: string, minutes: number): string {
    return toLocalInput(new Date(new Date(dueLocal).getTime() - minutes * 60_000).toISOString());
}
