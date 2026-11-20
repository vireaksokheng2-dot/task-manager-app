const TOKEN_KEY = 'taskly.token';

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public errors: Record<string, string[]> = {},
    ) {
        super(message);
    }

    /** First validation message for a field, if any. */
    first(field: string): string | undefined {
        return this.errors[field]?.[0];
    }
}

export function getToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* storage unavailable - session-only auth */
    }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void {
    onUnauthorized = fn;
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const token = getToken();
    let response: Response;

    try {
        response = await fetch(`/api${path}`, {
            method: options.method ?? 'GET',
            headers: {
                Accept: 'application/json',
                ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
    } catch {
        throw new ApiError(0, 'Cannot reach the server. Check your connection.');
    }

    if (response.status === 204) return undefined as T;

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        if (response.status === 401 && token) onUnauthorized();
        throw new ApiError(response.status, data?.message ?? `Request failed (${response.status})`, data?.errors ?? {});
    }

    return data as T;
}
