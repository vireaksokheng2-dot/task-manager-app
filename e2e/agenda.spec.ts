import { DAY, expect, HOUR, iso, openNewTask, test } from './fixtures';

test.describe('agenda & reminders workflow', () => {
    test.beforeEach(async ({ page }) => {
        // Later init scripts win: show the agenda instead of the fixture's default board.
        await page.addInitScript(() => localStorage.setItem('taskly.view', 'agenda'));
    });

    test('groups open tasks by day and keeps reminder-only tasks out of Overdue', async ({ page, api }) => {
        await api.createTask({ title: 'Late one', due_at: iso(-2 * DAY) });
        await api.createTask({ title: 'Next week', due_at: iso(3 * DAY) });
        await api.createTask({ title: 'Fired already', remind_at: iso(-3 * DAY) });
        await api.createTask({ title: 'Finished', status: 'done', due_at: iso(HOUR) });
        await page.goto('/');

        const overdue = page.getByRole('region', { name: 'Overdue' });
        await expect(overdue).toContainText('Late one');
        await expect(overdue).not.toContainText('Fired already');
        await expect(page.getByRole('region', { name: 'No date' })).toContainText('Fired already');
        await expect(page.getByText('Finished')).toHaveCount(0);
    });

    test('quick add understands a date, time, priority and creates a reminder', async ({ page, api }) => {
        await page.goto('/');
        await page.getByLabel('Quick add a task').fill('Water plants tomorrow 5pm !high');
        await expect(page.getByText('High priority')).toBeVisible();
        await expect(page.getByText(/Tomorrow, 5:00/)).toBeVisible();
        await page.getByLabel('Quick add a task').press('Enter');

        await expect(page.getByRole('region', { name: 'Tomorrow' })).toContainText('Water plants');
        const [task] = (await api.tasks()) as Array<Record<string, string>>;
        expect(task.title).toBe('Water plants');
        expect(task.priority).toBe('high');
        expect(task.remind_at).toBe(task.due_at);
        const due = new Date(task.due_at);
        expect(due.getHours()).toBe(17);
        await expect(page.getByLabel('Quick add a task')).toHaveValue('');
    });

    test('snoozing a reminder re-arms it for the chosen time', async ({ page, api }) => {
        const t = await api.createTask({ title: 'Stretch', remind_at: iso(-HOUR), due_at: iso(2 * HOUR) });
        await page.goto('/');

        await page.getByRole('button', { name: 'Snooze reminder for Stretch' }).click();
        await page.getByRole('button', { name: '1 hour', exact: true }).click();
        await expect(page.getByText(/Snoozed until/)).toBeVisible();

        await expect
            .poll(async () => {
                const row = (await api.tasks()).find((x) => x.id === t.id) as Record<string, string | null>;
                return {
                    rearmed: row.reminded_at === null,
                    minutes: Math.round((new Date(row.remind_at!).getTime() - Date.now()) / 60_000),
                };
            })
            .toEqual({ rearmed: true, minutes: expect.any(Number) });
        const row = (await api.tasks()).find((x) => x.id === t.id) as Record<string, string>;
        const minutes = (new Date(row.remind_at).getTime() - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(58);
        expect(minutes).toBeLessThan(61);
    });

    test('the task form can set a reminder relative to the due date', async ({ page, api }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);
        await dialog.getByLabel('Title', { exact: true }).fill('Submit report');
        await dialog.getByLabel('Due').fill('2030-06-15T14:00');
        await dialog.getByRole('button', { name: '1 hour before' }).click();
        await expect(dialog.getByLabel('Remind me')).toHaveValue('2030-06-15T13:00');
        await expect(dialog.getByRole('button', { name: '1 hour before' })).toHaveAttribute('aria-pressed', 'true');
        await dialog.getByRole('button', { name: 'Create task' }).click();

        await expect.poll(async () => (await api.tasks()).length).toBe(1);
        const [task] = (await api.tasks()) as Array<Record<string, string>>;
        expect(new Date(task.due_at).getTime() - new Date(task.remind_at).getTime()).toBe(HOUR);
    });
});
