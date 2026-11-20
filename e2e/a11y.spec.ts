import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { DAY, expect, iso, openNewTask, registerAccount, test } from './fixtures';
import { test as anon } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function audit(page: Page, what: string) {
    // Contrast is measured on rendered pixels, so let entrance animations finish first.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'));
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const summary = violations.map(
        (v) =>
            `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 4)
                .join('\n   ')}`,
    );
    expect(violations, `${what}:\n${summary.join('\n')}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
    anon.describe(`accessibility (${theme}) - signed out`, () => {
        anon.beforeEach(async ({ page }) => {
            await page.addInitScript((t) => localStorage.setItem('taskly.theme', t), theme);
        });

        anon('login page', async ({ page }) => {
            await page.goto('/login');
            await page.getByRole('button', { name: 'Sign in' }).waitFor();
            await audit(page, 'login');
        });

        anon('register page with validation errors', async ({ page }) => {
            const taken = await registerAccount('a11y');
            await page.goto('/register');
            await page.getByLabel('Name', { exact: true }).fill('A');
            await page.getByLabel('Email').fill(taken.email);
            await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
            await page.getByLabel('Confirm password').fill('nope');
            await page.getByRole('button', { name: 'Create account' }).click();
            await page.getByText(/already been taken/i).waitFor();
            await audit(page, 'register');
        });
    });

    test.describe(`accessibility (${theme}) - signed in`, () => {
        test.beforeEach(async ({ page }) => {
            await page.addInitScript((t) => localStorage.setItem('taskly.theme', t), theme);
        });

        test('board, list, dialog, bell and settings', async ({ page, api }) => {
            const work = await api.createLabel('Work');
            await api.createTask({
                title: 'Overdue report',
                priority: 'urgent',
                due_at: iso(-DAY),
                remind_at: iso(DAY),
                label_ids: [work.id],
                recurrence: 'weekly',
                description: 'Has a description',
                checklist: [{ title: 'a', is_done: true }, { title: 'b' }],
            });
            await api.createTask({ title: 'In flight', status: 'in_progress', priority: 'high' });
            await api.createTask({ title: 'Finished', status: 'done', priority: 'low' });
            await api.createTask({ title: 'Plain', priority: 'medium', due_at: iso(DAY) });

            await page.goto('/');
            await page.locator('article').first().waitFor();
            await audit(page, 'board');

            await page.getByRole('button', { name: 'Agenda', exact: true }).click();
            await page.getByLabel('Quick add a task').fill('Call mom tomorrow 5pm !high every week');
            await page.getByRole('button', { name: /Snooze reminder for Overdue report/ }).click();
            await audit(page, 'agenda view with quick-add preview and snooze options');
            await page.getByLabel('Quick add a task').fill('');

            await page.getByRole('button', { name: 'List', exact: true }).click();
            await audit(page, 'list view');
            await page.getByRole('button', { name: 'Board', exact: true }).click();

            await page
                .locator('article', { hasText: 'Overdue report' })
                .getByRole('button', { name: /Overdue report/ })
                .click();
            await page.getByRole('dialog', { name: 'Edit task' }).waitFor();
            await audit(page, 'edit dialog');
            await page.keyboard.press('Escape');

            const dialog = await openNewTask(page);
            await dialog.getByRole('button', { name: 'Create task' }).click(); // shows the validation error
            await audit(page, 'new dialog with error');
            await page.keyboard.press('Escape');

            await page.getByRole('button', { name: 'Reminders' }).click();
            await audit(page, 'notification menu');
            await page.keyboard.press('Escape');

            await page.goto('/settings');
            await page.getByRole('heading', { name: 'Settings' }).waitFor();
            await audit(page, 'settings');
        });
    });
}
