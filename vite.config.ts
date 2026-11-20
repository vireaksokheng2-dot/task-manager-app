import { defineConfig } from 'vitest/config';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.ts'],
            refresh: true,
        }),
        vue(),
        tailwindcss(),
    ],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./resources/js', import.meta.url)) },
    },
    server: {
        // Assets are loaded by the browser, so advertise localhost (not 0.0.0.0).
        origin: 'http://localhost:5173',
        // The page is served from :8000 but loads modules from :5173.
        cors: { origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ },
        watch: {
            ignored: ['**/storage/framework/views/**', '**/vendor/**'],
        },
    },
    test: {
        environment: 'jsdom',
        include: ['resources/js/**/*.test.ts'],
        setupFiles: ['resources/js/test/setup.ts'],
        restoreMocks: true,
    },
});
