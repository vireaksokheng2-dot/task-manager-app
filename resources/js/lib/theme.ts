export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'taskly.theme';

export function getThemeMode(): ThemeMode {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {
        /* storage unavailable */
    }
    return 'system';
}

export function prefersDark(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies a mode to <html> and remembers it. */
export function setThemeMode(mode: ThemeMode): void {
    try {
        if (mode === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, mode);
    } catch {
        /* storage unavailable - still apply for this session */
    }
    applyTheme(mode);
}

export function applyTheme(mode: ThemeMode = getThemeMode()): void {
    const dark = mode === 'dark' || (mode === 'system' && prefersDark());
    document.documentElement.classList.toggle('dark', dark);
}

/** Keep "system" in sync when the OS theme flips while the app is open. */
export function watchSystemTheme(): void {
    if (typeof matchMedia !== 'function') return;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getThemeMode() === 'system') applyTheme('system');
    });
}
