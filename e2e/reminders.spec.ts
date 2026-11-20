import { expect, HOUR, iso, test } from './fixtures';

// Needs the `scheduler` container (npm run serve starts it). The scheduler ticks once a
// minute and the app polls every 20s, so this legitimately takes up to ~90 seconds.
test.describe('reminders', () => {
    test.skip(!!process.env.E2E_SKIP_SLOW, 'slow test skipped via E2E_SKIP_SLOW');

    test('a due reminder reaches the open page as a toast and a bell badge, and is marked read on click', async ({
        page,
        api,
    }) => {
        test.setTimeout(150_000);
        const task = await api.createTask({ title: 'Call the dentist', remind_at: iso(-60_000), due_at: iso(HOUR) });
        await page.goto('/');
        await expect(
            page.locator('article', { hasText: 'Call the dentist' }).getByTitle(/Reminder (scheduled|sent)/),
        ).toBeVisible();

        // Arrives either as a live toast, or as a backlog summary if it fired before the page loaded.
        const bell = page.getByRole('button', { name: 'Reminders' });
        await expect(bell.locator('span')).toHaveText('1', { timeout: 120_000 });
        await expect(
            page.locator('article', { hasText: 'Call the dentist' }).getByTitle('Reminder sent'),
        ).toBeVisible();

        await bell.click();
        await page
            .getByRole('button', { name: /Call the dentist/ })
            .first()
            .click();
        await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
        await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Call the dentist');
        await page.keyboard.press('Escape');

        await expect(bell.locator('span')).toHaveCount(0); // marked as read
        const unread = await (
            await page.request.get('/api/notifications', {
                headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('taskly.token'))}` },
            })
        ).json();
        expect(unread.data).toHaveLength(0);
        expect(task.id).toBeGreaterThan(0);
    });
});
