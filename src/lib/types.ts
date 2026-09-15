export type Device = {
	id: string;
	name: string;
	hostname?: string;
	ip?: string;
	macAddress?: number;
	status: "online" | "offline";
	statusChangedAt?: Date;
	lastWokenAt?: Date;
	createdAt: Date;
	updatedAt: Date;
	deletedAt?: Date;
};
