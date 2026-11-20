import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a live stack (`npm run serve`), by default on :8000.
 * Each worker registers its own throw-away user, so tests never touch demo data.
 */
export default defineConfig({
    testDir: 'e2e',
    outputDir: 'e2e/.results/artifacts',
    timeout: 30_000,
    expect: { timeout: 7_000 },
    workers: 2,
    retries: process.env.CI ? 1 : 0,
    forbidOnly: !!process.env.CI,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.results/report' }]],
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8000',
        viewport: { width: 1360, height: 900 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        // Animations are on in the app; the suite runs with reduced motion for determinism.
        // `E2E_MOTION=1` runs it with full motion to prove nothing depends on animation timing.
        reducedMotion: process.env.E2E_MOTION ? 'no-preference' : 'reduce',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } }],
});
