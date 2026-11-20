import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, getToken, setToken, setUnauthorizedHandler } from '@/lib/api';
import type { User } from '@/types';

interface AuthResponse {
    user: User;
    token: string;
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const ready = ref(false);
    const isAuthenticated = computed(() => user.value !== null);

    function clear() {
        setToken(null);
        user.value = null;
    }

    setUnauthorizedHandler(clear);

    /** Restore the session from a stored token (called once by the router guard). */
    async function init() {
        if (ready.value) return;
        if (getToken()) {
            try {
                user.value = (await api<{ user: User }>('/me')).user;
            } catch {
                clear();
            }
        }
        ready.value = true;
    }

    async function login(email: string, password: string) {
        const res = await api<AuthResponse>('/login', { method: 'POST', body: { email, password } });
        setToken(res.token);
        user.value = res.user;
    }

    async function register(name: string, email: string, password: string, confirmation: string) {
        const res = await api<AuthResponse>('/register', {
            method: 'POST',
            body: {
                name,
                email,
                password,
                password_confirmation: confirmation,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
        });
        setToken(res.token);
        user.value = res.user;
    }

    async function updateProfile(input: Partial<Pick<User, 'name' | 'email' | 'timezone' | 'email_reminders'>>) {
        user.value = (await api<{ user: User }>('/me', { method: 'PATCH', body: input })).user;
    }

    async function changePassword(current: string, password: string, confirmation: string) {
        await api('/me/password', {
            method: 'PUT',
            body: { current_password: current, password, password_confirmation: confirmation },
        });
    }

    async function deleteAccount(password: string) {
        await api('/me', { method: 'DELETE', body: { password } });
        clear();
    }

    async function logout() {
        try {
            await api('/logout', { method: 'POST' });
        } catch {
            /* token may already be invalid - clear locally regardless */
        }
        clear();
    }

    return {
        user,
        ready,
        isAuthenticated,
        init,
        login,
        register,
        updateProfile,
        changePassword,
        deleteAccount,
        logout,
    };
});
