import '../css/app.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { applyTheme, watchSystemTheme } from '@/lib/theme';
import { router } from '@/router';

applyTheme();
watchSystemTheme();

createApp(App).use(createPinia()).use(router).mount('#app');
