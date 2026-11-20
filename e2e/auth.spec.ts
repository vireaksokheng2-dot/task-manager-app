import { expect, test as base } from '@playwright/test';
import { registerAccount } from './fixtures';

// These tests start signed out, so they use the plain Playwright `test`.
const test = base;

test.describe('authentication', () => {
    test('signed-out visitors are sent to the login page', async ({ page }) => {
        for (const path of ['/', '/settings']) {
            await page.goto(path);
            await expect(page).toHaveURL(/\/login$/);
        }
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        await expect(page).toHaveTitle(/Sign in/);
    });

    test('rejects a wrong password with a clear message', async ({ page }) => {
        const account = await registerAccount('badpw');
        await page.goto('/login');
        await page.getByLabel('Email').fill(account.email);
        await page.getByLabel('Password').fill('not-the-password');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page.getByRole('alert')).toContainText('do not match');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('registers, lands on an empty board, logs out and logs back in', async ({ page }) => {
        const email = `ui-${Date.now().toString(36)}@example.test`;

        await page.goto('/register');
        await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
        await page.getByLabel('Confirm password').fill('correct-horse-9');
        await page.getByRole('button', { name: 'Create account' }).click();

        await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
        await expect(page.getByRole('banner')).toContainText('Ada Lovelace');

        await page.getByRole('button', { name: 'Log out' }).click();
        await expect(page).toHaveURL(/\/login$/);

        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Password').fill('correct-horse-9');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
    });

    test('shows server-side validation errors on register', async ({ page }) => {
        const taken = await registerAccount('taken');
        await page.goto('/register');
        await page.getByLabel('Name', { exact: true }).fill('Someone');
        await page.getByLabel('Email').fill(taken.email);
        await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
        await page.getByLabel('Confirm password').fill('different-password');
        await page.getByRole('button', { name: 'Create account' }).click();

        await expect(page.getByText(/email has already been taken/i)).toBeVisible();
        await expect(page.getByText(/confirmation does not match/i)).toBeVisible();
        await expect(page).toHaveURL(/\/register$/);
    });

    test('an invalid or expired token sends you back to login', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('taskly.token', 'bogus-token'));
        await page.goto('/');
        await expect(page).toHaveURL(/\/login$/);
        expect(await page.evaluate(() => localStorage.getItem('taskly.token'))).toBeNull();
    });

    test('a signed-in user visiting /login is redirected to the board', async ({ page }) => {
        const account = await registerAccount('redir');
        await page.addInitScript((t) => localStorage.setItem('taskly.token', t), account.token);
        await page.goto('/login');
        await expect(page).toHaveURL(/\/$/);
    });

    test('logging out invalidates the token server-side', async ({ page, request }) => {
        const account = await registerAccount('logout');
        await page.addInitScript((t) => localStorage.setItem('taskly.token', t), account.token);
        await page.goto('/');
        await page.getByRole('button', { name: 'Log out' }).click();
        await expect(page).toHaveURL(/\/login$/);

        const res = await request.get('/api/me', {
            headers: { Authorization: `Bearer ${account.token}`, Accept: 'application/json' },
        });
        expect(res.status()).toBe(401);
    });
});
