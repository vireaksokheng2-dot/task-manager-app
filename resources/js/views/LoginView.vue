<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthLayout from '@/components/AuthLayout.vue';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
    busy.value = true;
    error.value = '';
    try {
        await auth.login(email.value, password.value);
        await router.push({ name: 'tasks' });
    } catch (e) {
        error.value = e instanceof ApiError ? (e.first('email') ?? e.message) : 'Something went wrong.';
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <AuthLayout title="Welcome back" subtitle="Sign in to see your tasks.">
        <form class="space-y-4" @submit.prevent="submit">
            <div>
                <label class="label" for="email">Email</label>
                <input id="email" v-model="email" class="field" type="email" autocomplete="email" required autofocus />
            </div>
            <div>
                <label class="label" for="password">Password</label>
                <input
                    id="password"
                    v-model="password"
                    class="field"
                    type="password"
                    autocomplete="current-password"
                    required
                />
            </div>
            <p v-if="error" class="text-sm text-red-600 dark:text-red-400" role="alert">{{ error }}</p>
            <button class="btn btn-primary w-full" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
        </form>
        <template #footer>
            New here?
            <RouterLink to="/register" class="font-medium text-accent-600 hover:underline dark:text-accent-400"
                >Create an account</RouterLink
            >
        </template>
    </AuthLayout>
</template>
