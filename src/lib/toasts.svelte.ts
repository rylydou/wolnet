import { isHttpError } from "@sveltejs/kit";

export type Toast = { id: number; text: string };

/** Newest first. */
export const toasts = $state<Toast[]>([]);

let nextId = 0;

export const dismiss = (id: number) => {
	const index = toasts.findIndex((toast) => toast.id === id);
	if (index !== -1) toasts.splice(index, 1);
};

/** Shows a short message in the corner for a few seconds. */
export const toast = (text: string, durationMs = 5_000) => {
	const id = nextId++;
	toasts.unshift({ id, text });
	setTimeout(() => dismiss(id), durationMs);
};

/** Shows what went wrong with a failed request. */
export const toastError = (error: unknown) =>
	toast(isHttpError(error) ? error.body.message : "Something went wrong. Check the server logs.", 8_000);
