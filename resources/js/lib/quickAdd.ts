import type { Label, Recurrence, TaskPriority } from '@/types';

/**
 * Natural-language quick add: "Call mom tomorrow 5pm !high #family every week".
 *
 * Recognised (case-insensitive, anywhere in the text; the recognised words are removed from the title):
 *   day      today · tonight · tomorrow · tmrw · monday…sunday (optionally "on/next/this/by") · "dec 5" · "5 dec"
 *   relative in 30 min · in 2 hours · in 3 days · in 1 week
 *   time     5pm · 5:30pm · at 5pm · 17:30 · at 17:30 · noon
 *   repeat   daily · weekly · monthly · every day|week|month · every <weekday>
 *   priority !low · !medium · !high · !urgent
 *   labels   #name (only when it matches one of the user's existing labels)
 *
 * A date without a time lands at 9:00 AM. A time without a day means the next time it occurs.
 * The parser is pure (`now` is injected) so it is straightforward to test.
 */

export interface QuickAddResult {
    title: string;
    due: Date | null;
    hasTime: boolean;
    priority: TaskPriority | null;
    recurrence: Recurrence | null;
    labelIds: number[];
    /** Human-readable chips describing what was understood, for the live preview. */
    recognized: { kind: 'due' | 'repeat' | 'priority' | 'label'; text: string }[];
}

const DEFAULT_HOUR = 9;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    tues: 2,
    wed: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    fri: 5,
    sat: 6,
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const WEEKDAY_FULL = WEEKDAYS.join('|');
const WEEKDAY_SHORT = Object.keys(WEEKDAY_ABBR).join('|');
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

const weekdayIndex = (word: string): number => {
    const w = word.toLowerCase();
    const full = WEEKDAYS.indexOf(w);
    return full !== -1 ? full : WEEKDAY_ABBR[w];
};

/** Removes the first match of `re` from `s`; returns the match and the remaining string. */
function take(s: string, re: RegExp): { match: RegExpMatchArray | null; rest: string } {
    const match = s.match(re);
    if (!match || match.index === undefined) return { match: null, rest: s };
    return { match, rest: `${s.slice(0, match.index)} ${s.slice(match.index + match[0].length)}` };
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function parseTime(s: string): { rest: string; hour: number; minute: number; text: string } | null {
    // 5pm · 5:30 pm · at 5pm
    let m = take(s, /(?<![\w:])(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)(?![\w])/i);
    if (m.match) {
        const [, h, min, mer] = m.match;
        let hour = Number(h) % 12;
        if (mer.toLowerCase() === 'pm') hour += 12;
        return { rest: m.rest, hour, minute: Number(min ?? 0), text: m.match[0].replace(/^at\s+/i, '').trim() };
    }
    // 17:30 · at 7:05
    m = take(s, /(?<![\w:])(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?![\w:])/i);
    if (m.match)
        return {
            rest: m.rest,
            hour: Number(m.match[1]),
            minute: Number(m.match[2]),
            text: m.match[0].replace(/^at\s+/i, '').trim(),
        };
    m = take(s, /(?<![\w])(?:at\s+)?noon(?![\w])/i);
    if (m.match) return { rest: m.rest, hour: 12, minute: 0, text: 'noon' };
    return null;
}

export function parseQuickAdd(
    input: string,
    labels: Pick<Label, 'id' | 'name'>[] = [],
    now: Date = new Date(),
): QuickAddResult {
    let s = ` ${input} `;
    const recognized: QuickAddResult['recognized'] = [];
    let recurrence: Recurrence | null = null;
    let priority: TaskPriority | null = null;
    const labelIds: number[] = [];
    let day: Date | null = null;
    let exactTime: Date | null = null; // for "in 30 minutes"
    let tonight = false;

    // --- priority ---------------------------------------------------------------------------
    const pri = take(s, /(?<![\w!])!(low|medium|med|high|urgent)(?![\w])/i);
    if (pri.match) {
        const word = pri.match[1].toLowerCase();
        priority = (word === 'med' ? 'medium' : word) as TaskPriority;
        s = pri.rest;
        recognized.push({ kind: 'priority', text: `${priority[0].toUpperCase()}${priority.slice(1)} priority` });
    }

    // --- labels (#name, only existing ones) ----------------------------------------------------
    for (const m of [...s.matchAll(/(?<![\w#])#([\w-]+)/g)]) {
        const label = labels.find(
            (l) =>
                l.name.toLowerCase().replace(/\s+/g, '-') === m[1].toLowerCase() ||
                l.name.toLowerCase() === m[1].toLowerCase(),
        );
        if (label && !labelIds.includes(label.id)) {
            labelIds.push(label.id);
            s = s.replace(m[0], ' ');
            recognized.push({ kind: 'label', text: label.name });
        }
    }

    // --- recurrence ----------------------------------------------------------------------------
    let everyWeekday: number | null = null;
    let r = take(s, new RegExp(`(?<![\\w])every\\s+(${WEEKDAY_FULL})(?![\\w])`, 'i'));
    if (r.match) {
        recurrence = 'weekly';
        everyWeekday = weekdayIndex(r.match[1]);
        s = r.rest;
    } else {
        r = take(s, /(?<![\w])(?:every\s+(day|week|month)|(daily|weekly|monthly))(?![\w])/i);
        if (r.match) {
            const word = (r.match[1] ?? r.match[2]).toLowerCase();
            recurrence =
                word.startsWith('day') || word === 'daily' ? 'daily' : word.startsWith('week') ? 'weekly' : 'monthly';
            s = r.rest;
        }
    }
    if (recurrence)
        recognized.push({
            kind: 'repeat',
            text: { daily: 'Every day', weekly: 'Every week', monthly: 'Every month', none: '' }[recurrence],
        });

    // --- "in 30 minutes / 2 hours / 3 days / 1 week" ------------------------------------------------
    const rel = take(s, /(?<![\w])(?:in\s+)(\d{1,3})\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)(?![\w])/i);
    if (rel.match) {
        const n = Number(rel.match[1]);
        const unit = rel.match[2].toLowerCase();
        if (unit.startsWith('m')) exactTime = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + n * 60_000);
        else if (unit.startsWith('h'))
            exactTime = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + n * 3_600_000);
        else day = addDays(now, unit.startsWith('d') ? n : n * 7);
        s = rel.rest;
    }

    // --- explicit calendar date: "dec 5", "5 dec", "december 5th" ------------------------------------
    if (!day && !exactTime) {
        let d = take(s, new RegExp(`(?<![\\w])(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\w])`, 'i'));
        let monthWord = d.match?.[1];
        let dom = d.match?.[2];
        if (!d.match) {
            d = take(s, new RegExp(`(?<![\\w])(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?![\\w])`, 'i'));
            dom = d.match?.[1];
            monthWord = d.match?.[2];
        }
        if (d.match && monthWord && dom) {
            const month = MONTHS.indexOf(monthWord.toLowerCase().slice(0, 3));
            const date = new Date(now.getFullYear(), month, Number(dom));
            // Reject impossible dates like "feb 30" (JS would roll them over) and leave the text alone.
            if (date.getMonth() === month && Number(dom) >= 1) {
                if (startOfDay(date) < startOfDay(now)) date.setFullYear(date.getFullYear() + 1);
                day = date;
                s = d.rest;
            }
        }
    }

    // --- named day -----------------------------------------------------------------------------------
    if (!day && !exactTime) {
        const named = take(s, /(?<![\w])(?:(?:on|by)\s+)?(today|tonight|tomorrow|tmrw|tmr)(?![\w])/i);
        if (named.match) {
            const w = named.match[1].toLowerCase();
            tonight = w === 'tonight';
            day = w === 'today' || tonight ? addDays(now, 0) : addDays(now, 1);
            s = named.rest;
        } else {
            const wd = take(s, new RegExp(`(?<![\\w])(?:(?:on|by|this|next)\\s+)?(${WEEKDAY_FULL})(?![\\w])`, 'i'));
            const wdShort = wd.match
                ? null
                : take(s, new RegExp(`(?<![\\w])(?:on|by|next)\\s+(${WEEKDAY_SHORT})(?![\\w])`, 'i'));
            const hit = wd.match ? wd : wdShort?.match ? wdShort : null;
            if (hit?.match) {
                const target = weekdayIndex(hit.match[1]);
                day = addDays(now, (target - now.getDay() + 7) % 7 || 7);
                s = hit.rest;
            } else if (everyWeekday !== null) {
                day = addDays(now, (everyWeekday - now.getDay() + 7) % 7 || 7);
            }
        }
    }

    // --- time of day ---------------------------------------------------------------------------------
    const time = exactTime ? null : parseTime(s);
    if (time) s = time.rest;

    // --- resolve -------------------------------------------------------------------------------------
    let due: Date | null = null;
    let hasTime = false;
    if (exactTime) {
        due = exactTime;
        hasTime = true;
    } else if (day || time) {
        const base = day ?? now;
        const hour = time?.hour ?? (tonight ? 20 : DEFAULT_HOUR);
        const minute = time?.minute ?? 0;
        due = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
        hasTime = !!time || tonight;
        // A bare time ("at 3pm") that has already passed today means the next occurrence: tomorrow.
        if (!day && time && due.getTime() <= now.getTime())
            due = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1, hour, minute);
    }

    const title = s.replace(/\s+/g, ' ').trim();

    // Never parse the whole input away: "tomorrow" alone stays a plain title.
    if (!title) {
        return {
            title: input.trim(),
            due: null,
            hasTime: false,
            priority: null,
            recurrence: null,
            labelIds: [],
            recognized: [],
        };
    }

    if (due) {
        recognized.unshift({ kind: 'due', text: describeDue(due, now) });
    }

    return { title, due, hasTime, priority, recurrence, labelIds, recognized };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function describeDue(due: Date, now: Date): string {
    const diff = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
    const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const day =
        diff === 0
            ? 'Today'
            : diff === 1
              ? 'Tomorrow'
              : diff > 1 && diff < 7
                ? due.toLocaleDateString(undefined, { weekday: 'long' })
                : due.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      ...(due.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
                  });
    return `${day}, ${time}`;
}
