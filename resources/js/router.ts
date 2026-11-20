import { createRouter, createWebHistory } from 'vue-router';
import { setPageTitle } from '@/lib/pageTitle';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'tasks',
            component: () => import('@/views/TasksView.vue'),
            meta: { auth: true, title: 'Tasks' },
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('@/views/SettingsView.vue'),
            meta: { auth: true, title: 'Settings' },
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('@/views/LoginView.vue'),
            meta: { guest: true, title: 'Sign in' },
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('@/views/RegisterView.vue'),
            meta: { guest: true, title: 'Create account' },
        },
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});

router.beforeEach(async (to) => {
    const auth = useAuthStore();
    await auth.init();

    if (to.meta.auth && !auth.isAuthenticated) return { name: 'login' };
    if (to.meta.guest && auth.isAuthenticated) return { name: 'tasks' };
});

router.afterEach((to) => {
    setPageTitle(to.meta.title as string | undefined);
});
