import ms from "ms";

export const futureDate = (date: Date, time: ms.StringValue | number) => {
	if (typeof time === "string") {
		time = ms(time);
	}
	return new Date(date.setMilliseconds(date.getMilliseconds() + time));
};

export const formatLongDate = (date: Date | string) => {
	if (typeof date === "string") {
		date = new Date(date);
	}

	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};
