import { card, cardTitles, column, DAY, expect, HOUR, iso, openNewTask, test } from './fixtures';

test.describe('tasks', () => {
    test('creates a task with only a title and updates the summary', async ({ page, api }) => {
        await api.reset();
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();

        await page.getByRole('button', { name: 'Create a task' }).click();
        await page.getByLabel('Title', { exact: true }).fill('Buy oat milk');
        await page.getByRole('button', { name: 'Create task' }).click();

        await expect(card(column(page, 'To do'), 'Buy oat milk')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Summary' })).toContainText('Open');
        await expect(
            page.getByRole('region', { name: 'Summary' }).getByText('1', { exact: true }).first(),
        ).toBeVisible();
    });

    test('rejects an empty title without closing the dialog', async ({ page }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);
        await dialog.getByRole('button', { name: 'Create task' }).click();

        await expect(dialog.getByText('Give your task a title.')).toBeVisible();
        await expect(dialog).toBeVisible();
    });

    test('edits every field and the change survives a reload', async ({ page, api }) => {
        await api.createTask({ title: 'Original', priority: 'low' });
        await page.goto('/');

        await card(page, 'Original')
            .getByRole('button', { name: /Original/ })
            .click();
        const dialog = page.getByRole('dialog', { name: 'Edit task' });
        await dialog.getByLabel('Title', { exact: true }).fill('Renamed');
        await dialog.getByLabel('Description').fill('Now with details');
        await dialog.getByLabel('Status').selectOption('in_progress');
        await dialog.getByLabel('Priority').selectOption('urgent');
        await dialog.getByRole('button', { name: 'Save changes' }).click();

        await expect(card(column(page, 'In progress'), 'Renamed')).toContainText('Urgent');
        await page.reload();
        const reloaded = card(column(page, 'In progress'), 'Renamed');
        await expect(reloaded).toContainText('Now with details');
        await expect(reloaded).toContainText('Urgent');
    });

    test('the checkbox completes and reopens a task', async ({ page, api }) => {
        await api.createTask({ title: 'Tick me', remind_at: iso(DAY) });
        await page.goto('/');

        await card(column(page, 'To do'), 'Tick me').getByRole('checkbox').check();
        const done = card(column(page, 'Done'), 'Tick me');
        await expect(done).toBeVisible();
        await expect(done.getByTitle('Reminder scheduled')).toHaveCount(0); // no reminder for finished tasks

        await done.getByRole('checkbox').uncheck();
        await expect(card(column(page, 'To do'), 'Tick me')).toBeVisible();
    });

    test('deleting offers Undo, which restores the task', async ({ page, api }) => {
        await api.createTask({ title: 'Oops', description: 'keep me' });
        await page.goto('/');

        await card(page, 'Oops').getByRole('button', { name: /Oops/ }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByRole('button', { name: 'Really delete?' }).click();

        await expect(card(page, 'Oops')).toHaveCount(0);
        await page.getByRole('button', { name: 'Undo' }).click();

        await expect(card(page, 'Oops')).toContainText('keep me');
        await page.reload();
        await expect(card(page, 'Oops')).toBeVisible();
    });

    test('a deleted task stays deleted after reload', async ({ page, api }) => {
        await api.createTask({ title: 'Gone for good' });
        await page.goto('/');
        await card(page, 'Gone for good')
            .getByRole('button', { name: /Gone for good/ })
            .click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByRole('button', { name: 'Really delete?' }).click();
        await expect(card(page, 'Gone for good')).toHaveCount(0);

        await page.reload();
        await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
    });

    test('drag & drop moves cards across and within columns, and persists', async ({ page, api }) => {
        await api.createTask({ title: 'A' });
        await api.createTask({ title: 'B' });
        await api.createTask({ title: 'C', status: 'in_progress' });
        await page.goto('/');

        // todo -> top of in_progress
        await card(column(page, 'To do'), /^A/).dragTo(column(page, 'In progress').locator('article').first(), {
            targetPosition: { x: 40, y: 4 },
        });
        await expect.poll(() => cardTitles(column(page, 'In progress'))).toEqual(['A', 'C']);

        // reorder within a column: A to the bottom
        await card(column(page, 'In progress'), /^A/).dragTo(column(page, 'In progress').locator('article').last(), {
            targetPosition: { x: 40, y: 50 },
        });
        await expect.poll(() => cardTitles(column(page, 'In progress'))).toEqual(['C', 'A']);

        // drop onto an empty column
        await card(column(page, 'To do'), /^B/).dragTo(column(page, 'Done'));
        await expect.poll(() => cardTitles(column(page, 'Done'))).toEqual(['B']);

        await page.reload();
        await expect(card(column(page, 'In progress'), /^C/)).toBeVisible();
        expect(await cardTitles(column(page, 'In progress'))).toEqual(['C', 'A']);
        expect(await cardTitles(column(page, 'Done'))).toEqual(['B']);
    });

    test('list view changes status with the dropdown', async ({ page, api }) => {
        await api.createTask({ title: 'Listed' });
        await page.goto('/');
        await page.getByRole('button', { name: 'List', exact: true }).click();

        await page.getByLabel('Status of Listed').selectOption('done');
        await page.getByRole('button', { name: 'Board', exact: true }).click();
        await expect(card(column(page, 'Done'), 'Listed')).toBeVisible();
    });

    test('search, priority, label and overdue filters', async ({ page, api }) => {
        const work = await api.createLabel('Work');
        await api.createTask({ title: 'Quarterly report', priority: 'high', label_ids: [work.id] });
        await api.createTask({ title: 'Water plants', priority: 'low' });
        await api.createTask({ title: 'Pay rent', priority: 'urgent', due_at: iso(-DAY) });
        await page.goto('/');
        await expect(page.locator('article')).toHaveCount(3);

        await page.getByLabel('Search tasks').fill('plants');
        await expect(page.locator('article')).toHaveCount(1);
        await page.getByLabel('Search tasks').fill('zzz');
        await expect(page.getByText('No tasks match your filters.')).toBeVisible();
        await page.getByLabel('Search tasks').fill('');

        await page.getByLabel('Filter by priority').selectOption('urgent');
        await expect(card(page, 'Pay rent')).toBeVisible();
        await expect(page.locator('article')).toHaveCount(1);
        await page.getByLabel('Filter by priority').selectOption('all');

        await page.getByLabel('Filter by label').selectOption({ label: 'Work' });
        await expect(page.locator('article')).toHaveCount(1);
        await expect(card(page, 'Quarterly report')).toBeVisible();
        await page.getByLabel('Filter by label').selectOption('all');

        await page.getByLabel('Overdue only').check();
        await expect(page.locator('article')).toHaveCount(1);
        await expect(card(page, 'Pay rent').getByTitle('Overdue')).toBeVisible();
    });

    test('summary counts overdue and completed tasks', async ({ page, api }) => {
        await api.createTask({ title: 'late', due_at: iso(-2 * HOUR) });
        await api.createTask({ title: 'finished', status: 'done' });
        await page.goto('/');

        const summary = page.getByRole('region', { name: 'Summary' });
        await expect(summary.locator('div', { hasText: /^Overdue1$/ })).toBeVisible();
        await expect(summary.locator('div', { hasText: /^Completed1$/ })).toBeVisible();
    });

    test('keyboard: "n" opens the dialog, Escape closes it and returns focus', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('heading', { name: 'Your tasks' }).waitFor({ state: 'attached' });
        await page.getByRole('button', { name: 'New task', exact: true }).focus();

        await page.getByRole('button', { name: 'New task', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'New task', exact: true })).toBeFocused();

        await page.locator('body').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('n');
        await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
    });

    test('"/" focuses the search box', async ({ page, api }) => {
        await api.createTask({ title: 'x' });
        await page.goto('/');
        await page.locator('article').first().waitFor();
        await page.locator('body').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('/');
        await expect(page.getByLabel('Search tasks')).toBeFocused();
    });

    test('focus stays trapped inside the dialog while tabbing', async ({ page }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);

        for (let i = 0; i < 30; i++) {
            await page.keyboard.press('Tab');
            const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
            expect(inside, `focus escaped the dialog on Tab #${i + 1}`).toBe(true);
        }
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Shift+Tab');
            expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        }
    });

    test('a past reminder warns the user, a future one is shown on the card', async ({ page }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);
        await dialog.getByLabel('Title', { exact: true }).fill('Reminded');
        await dialog.getByLabel('Remind me').fill('2020-01-01T09:00');
        await expect(dialog.getByText(/That time has passed/)).toBeVisible();
        await dialog.getByRole('button', { name: 'in 1 hour' }).click();
        await expect(dialog.getByText(/That time has passed/)).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Create task' }).click();

        await expect(card(page, 'Reminded').getByTitle('Reminder scheduled')).toBeVisible();
    });

    test("data is private: a second user cannot see this user's tasks", async ({ page, api, request }) => {
        const mine = await api.createTask({ title: 'Private thing' });
        const other = await (await import('./fixtures')).registerAccount('stranger');

        const headers = { Authorization: `Bearer ${other.token}`, Accept: 'application/json' };
        expect((await request.get(`/api/tasks/${mine.id}`, { headers })).status()).toBe(404);
        const list = await (await request.get('/api/tasks', { headers })).json();
        expect(list.data).toHaveLength(0);

        await page.goto('/');
        await expect(card(page, 'Private thing')).toBeVisible();
    });
});
