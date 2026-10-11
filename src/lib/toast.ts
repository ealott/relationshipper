import { createStore } from './store';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

export const toasts = createStore<Toast[]>([]);
let nextId = 1;

export function toast(message: string, tone: Toast['tone'] = 'info') {
  const id = nextId++;
  toasts.set([...toasts.get(), { id, message, tone }]);
  setTimeout(() => toasts.set(toasts.get().filter((t) => t.id !== id)), tone === 'error' ? 5000 : 3200);
}

export function toastError(err: unknown) {
  toast(err instanceof Error ? err.message : 'Something went wrong.', 'error');
}
