export type Toast = {
	id: number;
	text: string;
	description?: string;
	actions: ToastAction[];
};

export type ToastAction = {
	label: string;
	onClick: () => void;
};

export const toasts = $state<Toast[]>([]);

let letNextToastID = 0;

export const toast = (
	text: string,
	options: {
		description?: string;
		actions?: ToastAction | ToastAction[];
		time?: number;
	} = {},
) => {
	options.time ||= 5000;

	if (options.actions && !Array.isArray(options.actions)) {
		options.actions = [options.actions];
	}

	const toast = {
		id: letNextToastID++,
		text,
		description: options.description,
		actions: options.actions || [],
	};

	toasts.unshift(toast);

	if (options.time > 0) {
		setTimeout(() => {
			const toastIndex = toasts.findIndex((t) => t.id === toast.id);
			toasts.splice(toastIndex, 1);
		}, options.time);
	}
};
