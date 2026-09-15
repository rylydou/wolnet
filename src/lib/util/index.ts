export * from "./date";
export * from "./mac";

// Limit length of string based on max length. Will ellipsis at nearest word.
export const limitStringLength = (text: string, maxLength: number) => {
	if (!Number.isFinite(maxLength) || maxLength <= 0) return "";
	if (text.length <= maxLength) return text;

	if (maxLength <= 1) return ".".repeat(Math.floor(maxLength));

	const truncated = text.slice(0, maxLength - 1);
	const lastSpaceIndex = truncated.lastIndexOf(" ");
	const nearestWord = lastSpaceIndex > 0 ? truncated.slice(0, lastSpaceIndex).trimEnd() : truncated.trimEnd();

	return `${nearestWord}…`;
};
