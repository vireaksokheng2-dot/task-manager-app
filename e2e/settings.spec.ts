import { test as base } from '@playwright/test';
import { card, expect, registerAccount, test } from './fixtures';

test.describe('settings', () => {
    test('updates the profile and time zone', async ({ page }) => {
        await page.goto('/settings');
        await page.getByLabel('Name', { exact: true }).fill('Renamed Person');
        await page.getByLabel('Time zone').selectOption('Europe/Paris');
        await page.getByRole('button', { name: 'Save profile' }).click();
        await expect(page.getByText('Profile saved')).toBeVisible();
        await expect(page.getByRole('banner')).toContainText('Renamed Person');

        await page.reload();
        await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Paris');
        await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Renamed Person');
    });

    test('rejects an email that is already taken', async ({ page }) => {
        const other = await registerAccount('dup');
        await page.goto('/settings');
        await page.getByLabel('Email', { exact: true }).fill(other.email);
        await page.getByRole('button', { name: 'Save profile' }).click();
        await expect(page.getByText(/email has already been taken/i)).toBeVisible();
    });

    test('theme choice applies immediately and persists across reloads', async ({ page }) => {
        await page.goto('/settings');
        const html = page.locator('html');

        await page.getByRole('button', { name: 'Dark', pressed: false }).click();
        await expect(html).toHaveClass(/dark/);
        await page.reload();
        await expect(html).toHaveClass(/dark/); // applied before first paint, from storage

        await page.getByRole('button', { name: 'Light', pressed: false }).click();
        await expect(html).not.toHaveClass(/dark/);
    });

    test('the header button cycles system → light → dark', async ({ page }) => {
        await page.goto('/');
        const toggle = page.getByRole('button', { name: /theme \(click to change\)/ });
        await expect(toggle).toHaveAttribute('title', 'System theme');
        await toggle.click();
        await expect(toggle).toHaveAttribute('title', 'Light theme');
        await toggle.click();
        await expect(toggle).toHaveAttribute('title', 'Dark theme');
        await expect(page.locator('html')).toHaveClass(/dark/);
        await toggle.click();
        await expect(toggle).toHaveAttribute('title', 'System theme');
    });

    test('the email-reminder preference persists', async ({ page }) => {
        await page.goto('/settings');
        const box = page.getByLabel('Email me reminders');
        await expect(box).toBeChecked();
        await box.uncheck();
        await page.reload();
        await expect(page.getByLabel('Email me reminders')).not.toBeChecked();
        await page.getByLabel('Email me reminders').check();
    });

    test('manages labels: create, rename, recolour, delete', async ({ page, api }) => {
        const label = await api.createLabel('Old name');
        await api.createTask({ title: 'Tagged', label_ids: [label.id] });
        await page.goto('/settings');

        await expect(page.getByText('1 task', { exact: true })).toBeVisible();

        await page.getByLabel('New label name').fill('Fresh');
        await page.getByRole('button', { name: 'Add label' }).click();
        await expect(page.getByText('Fresh', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Edit label Old name' }).click();
        await page.getByLabel('Label name', { exact: true }).fill('New name');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText('New name', { exact: true })).toBeVisible();

        // renamed everywhere without a refetch
        await page.getByRole('link', { name: 'Tasks' }).click();
        await expect(card(page, 'Tagged')).toContainText('New name');
        await page.getByRole('link', { name: 'Settings' }).click();

        page.once('dialog', (d) => d.accept());
        await page.getByRole('button', { name: 'Delete label New name' }).click();
        await expect(page.getByText('New name', { exact: true })).toHaveCount(0);

        await page.getByRole('link', { name: 'Tasks' }).click();
        await expect(card(page, 'Tagged')).toBeVisible(); // the task survives
        await expect(card(page, 'Tagged')).not.toContainText('New name');
    });
});

// Destructive flows get their own throw-away accounts and a plain (signed-out) page.
base.describe('account security', () => {
    base('changes the password: wrong current is refused, new one works, old one stops working', async ({ page }) => {
        const acct = await registerAccount('pw');
        await page.addInitScript((t) => localStorage.setItem('taskly.token', t), acct.token);
        await page.goto('/settings');

        await page.getByLabel('Current password', { exact: true }).fill('wrong-password');
        await page.getByLabel('New password', { exact: true }).fill('brand-new-pass-1');
        await page.getByLabel('Confirm new password').fill('brand-new-pass-1');
        await page.getByRole('button', { name: 'Change password' }).click();
        await expect(page.getByText(/password is incorrect/i)).toBeVisible();

        await page.getByLabel('Current password', { exact: true }).fill(acct.password);
        await page.getByRole('button', { name: 'Change password' }).click();
        await expect(page.getByText('Password changed. Other devices were signed out.')).toBeVisible();

        await page.getByRole('button', { name: 'Log out' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await page.getByLabel('Email').fill(acct.email);
        await page.getByLabel('Password').fill(acct.password);
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('alert')).toContainText('do not match');

        await page.getByLabel('Password').fill('brand-new-pass-1');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
    });

    base('deleting the account needs the password and removes everything', async ({ page, request }) => {
        const acct = await registerAccount('del');
        await page.addInitScript((t) => localStorage.setItem('taskly.token', t), acct.token);
        await page.goto('/settings');

        await page.getByRole('button', { name: 'Delete my account…' }).click();
        await page.getByLabel('Confirm with your password').fill('wrong');
        await page.getByRole('button', { name: 'Permanently delete' }).click();
        await expect(page.getByRole('alert')).toContainText(/password is incorrect/i);
        await expect(page).toHaveURL(/\/settings$/);

        await page.getByLabel('Confirm with your password').fill(acct.password);
        await page.getByRole('button', { name: 'Permanently delete' }).click();
        await expect(page).toHaveURL(/\/register$/);

        const res = await request.post('/api/login', {
            headers: { Accept: 'application/json' },
            data: { email: acct.email, password: acct.password },
        });
        expect(res.status()).toBe(422);
    });
});
