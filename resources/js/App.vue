<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import ToastHost from '@/components/ToastHost.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

// Session expired (401) or logged out: go to the login screen from anywhere.
watch(
    () => auth.isAuthenticated,
    (authed) => {
        if (!authed && router.currentRoute.value.meta.auth) void router.push({ name: 'login' });
    },
);
</script>

<template>
    <RouterView />
    <ToastHost />
</template>
