import { expect, request, test as base, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8000';

export interface Account {
    name: string;
    email: string;
    password: string;
    token: string;
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Registers a throw-away user through the API. */
export async function registerAccount(label = 'e2e'): Promise<Account> {
    const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Accept: 'application/json' } });
    const account = { name: `E2E ${label}`, email: `${label}-${unique()}@example.test`, password: 'correct-horse-9' };
    const res = await ctx.post('/api/register', {
        data: { ...account, password_confirmation: account.password, timezone: 'Asia/Phnom_Penh' },
    });
    expect(res.ok(), `register failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const { token } = await res.json();
    await ctx.dispose();
    return { ...account, token };
}

export interface TaskPayload {
    title: string;
    status?: 'todo' | 'in_progress' | 'done';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
    description?: string | null;
    due_at?: string | null;
    remind_at?: string | null;
    label_ids?: number[];
    checklist?: { title: string; is_done?: boolean }[];
}

export class Api {
    constructor(private ctx: APIRequestContext) {}

    async createTask(data: TaskPayload) {
        const res = await this.ctx.post('/api/tasks', { data });
        expect(res.ok(), `createTask failed: ${await res.text()}`).toBeTruthy();
        return (await res.json()).data as { id: number; title: string };
    }

    async createLabel(name: string, color?: string) {
        const res = await this.ctx.post('/api/labels', { data: { name, ...(color ? { color } : {}) } });
        expect(res.ok(), `createLabel failed: ${await res.text()}`).toBeTruthy();
        return (await res.json()).data as { id: number; name: string };
    }

    async tasks() {
        return (await (await this.ctx.get('/api/tasks')).json()).data as Array<
            Record<string, unknown> & { id: number }
        >;
    }

    /** Leaves the account empty so each test starts from a known state. */
    async reset() {
        for (const t of await this.tasks()) await this.ctx.delete(`/api/tasks/${t.id}`);
        const labels = (await (await this.ctx.get('/api/labels')).json()).data as { id: number }[];
        for (const l of labels) await this.ctx.delete(`/api/labels/${l.id}`);
    }
}

export const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const test = base.extend<{ api: Api; account: Account }, { workerAccount: Account }>({
    workerAccount: [
        // Playwright requires an object-destructuring pattern here, even when empty.
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            await use(await registerAccount('worker'));
        },
        { scope: 'worker' },
    ],
    account: async ({ workerAccount }, use) => use(workerAccount),
    api: async ({ playwright, account }, use) => {
        const ctx = await playwright.request.newContext({
            baseURL: BASE_URL,
            extraHTTPHeaders: { Accept: 'application/json', Authorization: `Bearer ${account.token}` },
        });
        const api = new Api(ctx);
        await api.reset();
        await use(api);
        await ctx.dispose();
    },
    // `page` starts signed in as the worker's account.
    page: async ({ page, account }, use) => {
        await page.addInitScript((token) => {
            localStorage.setItem('taskly.token', token);
            localStorage.setItem('taskly.view', 'board'); // the board is what most specs drive; agenda has its own spec
        }, account.token);
        await use(page);
    },
});

export { expect };

export const column = (page: Page, name: 'To do' | 'In progress' | 'Done'): Locator =>
    page.getByRole('region', { name });

export const card = (page: Page, title: string | RegExp): Locator => page.locator('article', { hasText: title });

export const cardTitles = async (col: Locator): Promise<string[]> =>
    (await col.locator('article').allInnerTexts()).map((t) => t.split('\n')[0].trim());

/** Opens the "New task" modal and returns the dialog. */
export async function openNewTask(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New task' });
    await expect(dialog).toBeVisible();
    return dialog;
}

/** Fill a datetime-local input with a Date (in the browser's local time). */
export const localValue = (d: Date): string => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
