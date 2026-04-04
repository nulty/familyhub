import { writable } from 'svelte/store';

export const toasts = writable([]);

let nextId = 0;

export function showToast(message, duration = 3000) {
  const id = nextId++;
  toasts.update((t) => [...t, { id, message }]);
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function updateToast(id, message) {
  toasts.update((t) => t.map((item) => item.id === id ? { ...item, message } : item));
}

export function dismissToast(id) {
  toasts.update((t) => t.filter((item) => item.id !== id));
}
