import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '@/lib/quickAdd';

// Friday 2026-11-20, 15:00 local.
const now = new Date(2026, 10, 20, 15, 0);
const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min);
const parse = (s: string, labels: { id: number; name: string }[] = []) => parseQuickAdd(s, labels, now);

describe('parseQuickAdd', () => {
    it('leaves plain text alone', () => {
        const r = parse('Buy oat milk');
        expect(r).toMatchObject({ title: 'Buy oat milk', due: null, priority: null, recurrence: null, labelIds: [] });
        expect(r.recognized).toEqual([]);
    });

    it('parses a day and a time and strips them from the title', () => {
        const r = parse('Call mom tomorrow 5pm');
        expect(r.title).toBe('Call mom');
        expect(r.due).toEqual(at(2026, 11, 21, 17));
        expect(r.hasTime).toBe(true);
    });

    it('defaults a date-only task to 9:00 AM', () => {
        const r = parse('Pay rent tomorrow');
        expect(r.due).toEqual(at(2026, 11, 21, 9));
        expect(r.hasTime).toBe(false);
    });

    it('understands "at", minutes, 24-hour clock and noon', () => {
        expect(parse('Standup tomorrow at 9:30am').due).toEqual(at(2026, 11, 21, 9, 30));
        expect(parse('Dinner tomorrow at 7:15 pm').due).toEqual(at(2026, 11, 21, 19, 15));
        expect(parse('Deploy tomorrow 17:45').due).toEqual(at(2026, 11, 21, 17, 45));
        expect(parse('Lunch tomorrow at noon').due).toEqual(at(2026, 11, 21, 12, 0));
        expect(parse('Sync tomorrow 12am').due).toEqual(at(2026, 11, 21, 0, 0));
        expect(parse('Sync tomorrow 12pm').due).toEqual(at(2026, 11, 21, 12, 0));
    });

    it('a bare time means the next occurrence', () => {
        expect(parse('Stretch at 5pm').due).toEqual(at(2026, 11, 20, 17)); // later today
        expect(parse('Stretch at 8am').due).toEqual(at(2026, 11, 21, 8)); // already passed -> tomorrow
        expect(parse('Stretch 15:00').due).toEqual(at(2026, 11, 21, 15)); // exactly now is not in the future
    });

    it('explicit "today" is kept even when the time has passed', () => {
        expect(parse('Review today 8am').due).toEqual(at(2026, 11, 20, 8));
    });

    it('tonight defaults to 8 PM', () => {
        const r = parse('Laundry tonight');
        expect(r.due).toEqual(at(2026, 11, 20, 20));
        expect(r.hasTime).toBe(true);
    });

    it('weekday names resolve to the next occurrence', () => {
        expect(parse('Gym monday').due).toEqual(at(2026, 11, 23, 9));
        expect(parse('Gym on friday').due).toEqual(at(2026, 11, 27, 9)); // today is Friday -> next week
        expect(parse('Report by wednesday 2pm').due).toEqual(at(2026, 11, 25, 14));
        expect(parse('Plan next tue').due).toEqual(at(2026, 11, 24, 9));
        expect(parse('Plan next tue').title).toBe('Plan');
    });

    it('bare weekday abbreviations are not parsed (they are common words)', () => {
        expect(parse('Read sat nav manual').due).toBeNull();
        expect(parse('Wash the sun hat').title).toBe('Wash the sun hat');
    });

    it('parses calendar dates and rolls past ones to next year', () => {
        expect(parse('Birthday dec 5').due).toEqual(at(2026, 12, 5, 9));
        expect(parse('Birthday 5 december').due).toEqual(at(2026, 12, 5, 9));
        expect(parse('Tax on march 3rd 10am').due).toEqual(at(2027, 3, 3, 10));
        expect(parse('Tax on march 3rd 10am').title).toBe('Tax');
        expect(parse('Today-ish nov 20').due).toEqual(at(2026, 11, 20, 9)); // today is still today
    });

    it('does not accept impossible dates', () => {
        const r = parse('Odd feb 30');
        expect(r.due).toBeNull();
        expect(r.title).toBe('Odd feb 30');
    });

    it('parses relative offsets', () => {
        expect(parse('Tea in 30 min').due).toEqual(at(2026, 11, 20, 15, 30));
        expect(parse('Tea in 2 hours').due).toEqual(at(2026, 11, 20, 17, 0));
        expect(parse('Tea in 2 hours').title).toBe('Tea');
        expect(parse('Check in 3 days').due).toEqual(at(2026, 11, 23, 9));
        expect(parse('Check in 3 days 4pm').due).toEqual(at(2026, 11, 23, 16));
        expect(parse('Review in 1 week').due).toEqual(at(2026, 11, 27, 9));
    });

    it('parses priority', () => {
        expect(parse('Fix bug !urgent')).toMatchObject({ title: 'Fix bug', priority: 'urgent' });
        expect(parse('!med Email Sam')).toMatchObject({ title: 'Email Sam', priority: 'medium' });
        expect(parse('Wow!high')).toMatchObject({ priority: null }); // must stand alone
    });

    it('matches only existing labels, case-insensitively, including multi-word names', () => {
        const labels = [
            { id: 1, name: 'Work' },
            { id: 2, name: 'Side Project' },
        ];
        const r = parse('Ship it #work #side-project #nope', labels);
        expect(r.labelIds).toEqual([1, 2]);
        expect(r.title).toBe('Ship it #nope'); // unknown tags remain visible in the title
    });

    it('parses recurrence', () => {
        expect(parse('Water plants every day')).toMatchObject({ title: 'Water plants', recurrence: 'daily' });
        expect(parse('Review weekly')).toMatchObject({ title: 'Review', recurrence: 'weekly' });
        expect(parse('Rent monthly')).toMatchObject({ recurrence: 'monthly' });
    });

    it('"every <weekday>" repeats weekly starting on that weekday', () => {
        const r = parse('Team sync every monday 10am');
        expect(r).toMatchObject({ title: 'Team sync', recurrence: 'weekly' });
        expect(r.due).toEqual(at(2026, 11, 23, 10));
    });

    it('combines everything', () => {
        const r = parse('Call mom tomorrow 5pm !high #family every week', [{ id: 9, name: 'Family' }]);
        expect(r).toMatchObject({ title: 'Call mom', priority: 'high', recurrence: 'weekly', labelIds: [9] });
        expect(r.due).toEqual(at(2026, 11, 21, 17));
        expect(r.recognized.map((c) => c.kind)).toEqual(['due', 'priority', 'label', 'repeat']);
    });

    it('never swallows the entire input', () => {
        expect(parse('tomorrow')).toMatchObject({ title: 'tomorrow', due: null });
        expect(parse('tomorrow 5pm !high')).toMatchObject({ title: 'tomorrow 5pm !high', due: null, priority: null });
    });

    it('does not match inside other words', () => {
        expect(parse('Sundaes for dessert').due).toBeNull();
        expect(parse('Update todayfeed').due).toBeNull();
        expect(parse('Order 5 apples').due).toBeNull();
        expect(parse('Call 555:30 line').due).toBeNull();
    });

    it('is deterministic across a DST boundary and keeps local wall-clock time', () => {
        const nowUS = new Date(2026, 2, 7, 12, 0); // day before US spring-forward in zones that observe it
        const r = parseQuickAdd('Brunch sunday 10am', [], nowUS);
        expect(r.due).toEqual(new Date(2026, 2, 8, 10, 0));
    });
});
