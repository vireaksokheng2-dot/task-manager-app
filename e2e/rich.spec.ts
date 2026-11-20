import { card, column, DAY, expect, iso, openNewTask, test } from './fixtures';

test.describe('labels, checklists and recurrence', () => {
    test('creates a label inline, attaches it, shows it on the card and filters by it', async ({ page }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);
        await dialog.getByLabel('Title', { exact: true }).fill('Plan launch');

        await dialog.getByLabel('New label name').fill('Marketing');
        await dialog.getByLabel('New label name').press('Enter'); // Enter must add the label, not submit the form
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Marketing', pressed: true })).toBeVisible();

        await dialog.getByRole('button', { name: 'Create task' }).click();
        await expect(card(page, 'Plan launch')).toContainText('Marketing');

        await page.getByLabel('Filter by label').selectOption({ label: 'Marketing' });
        await expect(card(page, 'Plan launch')).toBeVisible();
    });

    test('duplicate label names (any case) are rejected with a message', async ({ page, api }) => {
        await api.createLabel('Home');
        await page.goto('/');
        const dialog = await openNewTask(page);

        await dialog.getByLabel('New label name').fill('home');
        await dialog.getByRole('button', { name: 'Add', exact: true }).first().click();
        await expect(dialog.getByRole('alert')).toContainText('already have a label');
    });

    test('toggles a label on and off in the editor', async ({ page, api }) => {
        const label = await api.createLabel('Urgent stuff');
        await api.createTask({ title: 'Has label', label_ids: [label.id] });
        await page.goto('/');

        await card(page, 'Has label')
            .getByRole('button', { name: /Has label/ })
            .click();
        const dialog = page.getByRole('dialog', { name: 'Edit task' });
        await dialog.getByRole('button', { name: 'Urgent stuff', pressed: true }).click();
        await dialog.getByRole('button', { name: 'Save changes' }).click();

        await expect(card(page, 'Has label')).not.toContainText('Urgent stuff');
    });

    test('checklist: add with Enter, tick, reorder, remove, and see progress on the card', async ({ page }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);
        await dialog.getByLabel('Title', { exact: true }).fill('Pack for trip');

        const add = dialog.getByLabel('New checklist item');
        for (const item of ['Passport', 'Charger', 'Tickets']) {
            await add.fill(item);
            await add.press('Enter');
        }
        await expect(dialog).toBeVisible(); // Enter in the checklist must not submit the task
        await expect(dialog.getByLabel(/^Checklist item/)).toHaveCount(3);

        await dialog.getByLabel('Done: Passport').check();
        await dialog.getByLabel('Move item 3 up').click(); // Tickets above Charger
        await dialog.getByLabel('Remove item 3').click(); // removes Charger
        await dialog.getByRole('button', { name: 'Create task' }).click();

        const created = card(page, 'Pack for trip');
        await expect(created).toContainText('1/2');

        await created.getByRole('button', { name: /Pack for trip/ }).click();
        const edit = page.getByRole('dialog', { name: 'Edit task' });
        const values = await edit
            .getByLabel(/^Checklist item/)
            .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        expect(values).toEqual(['Passport', 'Tickets']);
        await expect(edit.getByLabel('Done: Passport')).toBeChecked();
        await expect(edit.getByLabel('Done: Tickets')).not.toBeChecked();
    });

    test('a half-typed checklist item is kept on save', async ({ page }) => {
        await page.goto('/');
        const dialog = await openNewTask(page);
        await dialog.getByLabel('Title', { exact: true }).fill('Draft');
        await dialog.getByLabel('New checklist item').fill('Do not lose me');
        await dialog.getByRole('button', { name: 'Create task' }).click();

        await expect(card(page, 'Draft')).toContainText('0/1');
    });

    test('completing a recurring task creates the next occurrence', async ({ page, api }) => {
        await api.createTask({ title: 'Water plants', recurrence: 'daily', due_at: iso(-2 * 3_600_000) });
        await page.goto('/');

        await card(column(page, 'To do'), 'Water plants').getByRole('checkbox').check();

        await expect(page.locator('article', { hasText: 'Water plants' })).toHaveCount(2);
        await expect(card(column(page, 'Done'), 'Water plants')).toHaveCount(1);
        const next = card(column(page, 'To do'), 'Water plants');
        await expect(next).toContainText('daily');
        await expect(next.getByTitle(/Due|Overdue/)).toBeVisible();

        // the new occurrence is in the future, so it isn't overdue
        await expect(next.locator('[title="Overdue"]')).toHaveCount(0);

        // reopening and re-completing the original does not create a third copy
        await card(column(page, 'Done'), 'Water plants').getByRole('checkbox').uncheck();
        await card(column(page, 'To do'), 'Water plants').first().waitFor();
        await expect.poll(async () => (await api.tasks()).length).toBe(2);
    });

    test('setting a repeat in the editor is saved', async ({ page, api }) => {
        await api.createTask({ title: 'Weekly review', due_at: iso(DAY) });
        await page.goto('/');
        await card(page, 'Weekly review')
            .getByRole('button', { name: /Weekly review/ })
            .click();
        const dialog = page.getByRole('dialog', { name: 'Edit task' });
        await dialog.getByLabel('Repeat').selectOption('weekly');
        await expect(dialog.getByText(/next one is created automatically/)).toBeVisible();
        await dialog.getByRole('button', { name: 'Save changes' }).click();

        await expect(card(page, 'Weekly review')).toContainText('weekly');
    });
});
