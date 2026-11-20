import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    dayDiff,
    formatDateTime,
    formatDistance,
    formatRelative,
    fromLocalInput,
    groupByDay,
    inHours,
    isOverdue,
    isToday,
    leadBefore,
    snoozePresets,
    toLocalInput,
    tomorrowAt,
} from '@/lib/dates';

describe('dates', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-10T05:00:00Z')); // 12:00 in Phnom Penh
    });
    afterEach(() => vi.useRealTimers());

    it('converts an ISO instant to a local datetime-local value', () => {
        expect(toLocalInput('2026-03-10T02:30:00Z')).toBe('2026-03-10T09:30');
        expect(toLocalInput(null)).toBe('');
    });

    it('converts a datetime-local value back to a UTC ISO string', () => {
        expect(fromLocalInput('2026-03-10T09:30')).toBe('2026-03-10T02:30:00.000Z');
        expect(fromLocalInput('')).toBeNull();
        expect(fromLocalInput('not a date')).toBeNull();
    });

    it('round-trips', () => {
        const iso = '2026-07-01T10:15:00.000Z';
        expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    });

    it('flags only unfinished, past-due tasks as overdue', () => {
        const now = Date.now();
        expect(isOverdue('2026-03-10T04:00:00Z', false, now)).toBe(true);
        expect(isOverdue('2026-03-10T06:00:00Z', false, now)).toBe(false);
        expect(isOverdue('2026-03-10T04:00:00Z', true, now)).toBe(false);
        expect(isOverdue(null, false, now)).toBe(false);
    });

    it('detects "today" in the local time zone', () => {
        expect(isToday('2026-03-10T16:59:00Z')).toBe(true); // 23:59 local
        expect(isToday('2026-03-10T17:01:00Z')).toBe(false); // 00:01 tomorrow local
        expect(isToday(null)).toBe(false);
    });

    it('omits the year for dates in the current year', () => {
        expect(formatDateTime('2026-05-01T02:00:00Z')).not.toContain('2026');
        expect(formatDateTime('2027-05-01T02:00:00Z')).toContain('2027');
    });

    it('builds reminder presets', () => {
        expect(inHours(1)).toBe('2026-03-10T13:00');
        expect(tomorrowAt(9)).toBe('2026-03-11T09:00');
    });
});

describe('relative dates', () => {
    // Friday 2026-11-20, 15:00 local.
    const now = new Date(2026, 10, 20, 15, 0);
    const local = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

    it('counts calendar days, not 24h blocks', () => {
        expect(dayDiff(local(2026, 11, 20, 23, 59), now)).toBe(0);
        expect(dayDiff(local(2026, 11, 21, 0, 1), now)).toBe(1);
        expect(dayDiff(local(2026, 11, 19, 23, 59), now)).toBe(-1);
        expect(dayDiff(local(2026, 12, 20), now)).toBe(30);
    });

    it('formats today / tomorrow / yesterday / weekday / date', () => {
        expect(formatRelative(local(2026, 11, 20, 17), now)).toMatch(/^Today, /);
        expect(formatRelative(local(2026, 11, 21), now)).toMatch(/^Tomorrow, /);
        expect(formatRelative(local(2026, 11, 19), now)).toMatch(/^Yesterday, /);
        expect(formatRelative(local(2026, 11, 24), now)).toMatch(/^[A-Z][a-z]{2}, /); // weekday
        expect(formatRelative(local(2026, 12, 5), now)).toContain('Dec');
        expect(formatRelative(local(2027, 1, 5), now)).toContain('2027');
    });

    it('describes distance', () => {
        const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
        expect(formatDistance(at(10 * 60_000), now)).toBe('in 10 min');
        expect(formatDistance(at(-3 * 3_600_000), now)).toBe('3 hr ago');
        expect(formatDistance(at(26 * 3_600_000), now)).toBe('in 1 day');
        expect(formatDistance(at(-3 * 86_400_000), now)).toBe('3 days ago');
        expect(formatDistance(at(10_000), now)).toBe('now');
    });

    it('groups by day in display order and omits empty buckets', () => {
        const items = [
            { id: 'later', w: local(2026, 12, 30) },
            { id: 'none', w: null },
            { id: 'today2', w: local(2026, 11, 20, 18) },
            { id: 'over', w: local(2026, 11, 18) },
            { id: 'tmrw', w: local(2026, 11, 21) },
            { id: 'wk', w: local(2026, 11, 24) },
            { id: 'today1', w: local(2026, 11, 20, 9) },
        ];
        const groups = groupByDay(items, (i) => i.w, now);
        expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'tomorrow', 'd4', 'later', 'none']);
        expect(groups.find((g) => g.key === 'today')!.items.map((i) => i.id)).toEqual(['today2', 'today1']); // input order kept
        expect(groups[0].tone).toBe('overdue');
        expect(groups.find((g) => g.key === 'd4')!.title).toBe(
            new Date(2026, 10, 24).toLocaleDateString(undefined, { weekday: 'long' }),
        );
    });

    it('treats a task due earlier today as Today, not Overdue', () => {
        const groups = groupByDay([{ w: local(2026, 11, 20, 8) }], (i) => i.w, now);
        expect(groups.map((g) => g.key)).toEqual(['today']);
    });

    it('offers snooze presets that are all in the future and never duplicate Monday', () => {
        const morning = snoozePresets(new Date(2026, 10, 20, 10, 0)); // Friday
        expect(morning.map((p) => p.id)).toEqual(['10m', '1h', 'later', 'tomorrow', 'monday']);
        expect(morning.find((p) => p.id === 'later')!.until).toEqual(new Date(2026, 10, 20, 18, 0));
        expect(morning.find((p) => p.id === 'monday')!.until).toEqual(new Date(2026, 10, 23, 9, 0));
        expect(snoozePresets(new Date(2026, 10, 20, 17, 0)).map((p) => p.id)).not.toContain('later');
        expect(snoozePresets(new Date(2026, 10, 22, 10, 0)).map((p) => p.id)).not.toContain('monday'); // Sunday
        for (const t of [new Date(2026, 10, 20, 23, 59), new Date(2026, 10, 23, 9, 0), new Date(2026, 10, 21, 12, 0)]) {
            for (const p of snoozePresets(t)) expect(p.until.getTime(), p.id).toBeGreaterThan(t.getTime());
        }
        // Monday asks for the following Monday, not today.
        expect(snoozePresets(new Date(2026, 10, 23, 9, 0)).find((p) => p.id === 'monday')!.until).toEqual(
            new Date(2026, 10, 30, 9, 0),
        );
    });

    it('computes a reminder lead before a due value', () => {
        expect(leadBefore('2026-11-20T17:00', 0)).toBe('2026-11-20T17:00');
        expect(leadBefore('2026-11-20T17:00', 10)).toBe('2026-11-20T16:50');
        expect(leadBefore('2026-11-20T00:30', 60)).toBe('2026-11-19T23:30');
        expect(leadBefore('2026-11-20T09:00', 1440)).toBe('2026-11-19T09:00');
    });
});
