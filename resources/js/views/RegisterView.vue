<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthLayout from '@/components/AuthLayout.vue';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const form = reactive({ name: '', email: '', password: '', confirmation: '' });
const errors = ref<Record<string, string[]>>({});
const error = ref('');
const busy = ref(false);

async function submit() {
    busy.value = true;
    errors.value = {};
    error.value = '';
    try {
        await auth.register(form.name, form.email, form.password, form.confirmation);
        await router.push({ name: 'tasks' });
    } catch (e) {
        if (e instanceof ApiError) {
            errors.value = e.errors;
            if (!Object.keys(e.errors).length) error.value = e.message;
        } else error.value = 'Something went wrong.';
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <AuthLayout title="Create your account" subtitle="Plan your work and never miss a deadline.">
        <form class="space-y-4" @submit.prevent="submit">
            <div>
                <label class="label" for="name">Name</label>
                <input id="name" v-model="form.name" class="field" autocomplete="name" required autofocus />
                <p v-if="errors.name" class="mt-1 text-xs text-red-600 dark:text-red-400">{{ errors.name[0] }}</p>
            </div>
            <div>
                <label class="label" for="email">Email</label>
                <input id="email" v-model="form.email" class="field" type="email" autocomplete="email" required />
                <p v-if="errors.email" class="mt-1 text-xs text-red-600 dark:text-red-400">{{ errors.email[0] }}</p>
            </div>
            <div>
                <label class="label" for="password">Password</label>
                <input
                    id="password"
                    v-model="form.password"
                    class="field"
                    type="password"
                    autocomplete="new-password"
                    minlength="8"
                    required
                />
                <p v-if="errors.password" class="mt-1 text-xs text-red-600 dark:text-red-400">
                    {{ errors.password[0] }}
                </p>
                <p v-else class="mt-1 text-xs text-ink-600 dark:text-ink-400">At least 8 characters.</p>
            </div>
            <div>
                <label class="label" for="confirm">Confirm password</label>
                <input
                    id="confirm"
                    v-model="form.confirmation"
                    class="field"
                    type="password"
                    autocomplete="new-password"
                    required
                />
            </div>
            <p v-if="error" class="text-sm text-red-600 dark:text-red-400" role="alert">{{ error }}</p>
            <button class="btn btn-primary w-full" :disabled="busy">{{ busy ? 'Creating…' : 'Create account' }}</button>
        </form>
        <template #footer>
            Already registered?
            <RouterLink to="/login" class="font-medium text-accent-600 hover:underline dark:text-accent-400"
                >Sign in</RouterLink
            >
        </template>
    </AuthLayout>
</template>
