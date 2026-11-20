import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastAction {
    label: string;
    run: () => void | Promise<void>;
}

export interface Toast {
    id: number;
    message: string;
    kind: 'info' | 'success' | 'error' | 'reminder';
    action?: ToastAction;
}

export const useToastStore = defineStore('toasts', () => {
    const toasts = ref<Toast[]>([]);
    let nextId = 1;

    function dismiss(id: number) {
        toasts.value = toasts.value.filter((t) => t.id !== id);
    }

    function push(message: string, kind: Toast['kind'] = 'info', ms = 5000, action?: ToastAction) {
        const id = nextId++;
        toasts.value.push({ id, message, kind, action });
        if (ms > 0) setTimeout(() => dismiss(id), ms);
        return id;
    }

    return { toasts, push, dismiss };
});
