import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getThemeMode, setThemeMode } from '@/lib/theme';

function mockSystemDark(dark: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: dark && query.includes('dark'),
        addEventListener: () => {},
        removeEventListener: () => {},
    }));
}

describe('theme', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.className = '';
        mockSystemDark(false);
    });

    it('defaults to system', () => {
        expect(getThemeMode()).toBe('system');
    });

    it('applies and persists an explicit choice', () => {
        setThemeMode('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(getThemeMode()).toBe('dark');

        setThemeMode('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(getThemeMode()).toBe('light');
    });

    it('follows the OS in system mode and forgets the stored choice', () => {
        setThemeMode('light');
        mockSystemDark(true);
        setThemeMode('system');

        expect(localStorage.getItem('taskly.theme')).toBeNull();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('an explicit light mode beats a dark OS', () => {
        mockSystemDark(true);
        setThemeMode('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        applyTheme();
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
