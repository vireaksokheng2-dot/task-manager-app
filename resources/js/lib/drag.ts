import { ref } from 'vue';

/** Id of the task currently being dragged (dragover handlers can't read dataTransfer). */
export const draggingId = ref<number | null>(null);
