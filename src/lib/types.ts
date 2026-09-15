export type Device = {
	id: string;
	comment?: string;
	hostname?: string;
	ip?: string;
	macAddress?: number;
	status: "online" | "offline";
	statusChangedAt?: Date;
	lastWokenAt?: Date;
	createdAt: Date;
	updatedAt: Date;
};
