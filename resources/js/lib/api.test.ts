import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from '@/lib/api';

function respond(status: number, body?: unknown) {
    return vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe('api client', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => setUnauthorizedHandler(() => {}));

    it('sends JSON and the bearer token', async () => {
        setToken('abc');
        const spy = respond(200, { ok: true });

        const result = await api<{ ok: boolean }>('/tasks', { method: 'POST', body: { title: 'x' } });

        expect(result).toEqual({ ok: true });
        const [url, init] = spy.mock.calls[0];
        expect(url).toBe('/api/tasks');
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe('{"title":"x"}');
        expect(init?.headers).toMatchObject({
            Authorization: 'Bearer abc',
            Accept: 'application/json',
            'Content-Type': 'application/json',
        });
    });

    it('omits auth and content-type when not needed', async () => {
        const spy = respond(200, {});
        await api('/me');
        const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBeUndefined();
        expect(headers['Content-Type']).toBeUndefined();
    });

    it('returns undefined for 204', async () => {
        respond(204);
        await expect(api('/tasks/1', { method: 'DELETE' })).resolves.toBeUndefined();
    });

    it('throws ApiError with validation messages', async () => {
        respond(422, { message: 'Invalid', errors: { title: ['Required.'] } });

        const err = (await api('/tasks', { method: 'POST', body: {} }).catch((e) => e)) as ApiError;

        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(422);
        expect(err.first('title')).toBe('Required.');
        expect(err.first('nope')).toBeUndefined();
    });

    it('reports network failures as status 0', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
        const err = (await api('/tasks').catch((e) => e)) as ApiError;
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(0);
    });

    it('survives a non-JSON error body', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>oops</html>', { status: 500 }));
        const err = (await api('/tasks').catch((e) => e)) as ApiError;
        expect(err.message).toBe('Request failed (500)');
    });

    it('calls the unauthorized handler on 401 only when a token was sent', async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);

        respond(401, { message: 'Unauthenticated.' });
        await api('/me').catch(() => {});
        expect(handler).not.toHaveBeenCalled(); // e.g. a failed login has no token

        setToken('expired');
        await api('/me').catch(() => {});
        expect(handler).toHaveBeenCalledOnce();
    });

    it('stores and clears the token', () => {
        setToken('t');
        expect(getToken()).toBe('t');
        setToken(null);
        expect(getToken()).toBeNull();
    });
});
