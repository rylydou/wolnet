/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	tabWidth: 2,
	singleQuote: false,
	trailingComma: "all",
	printWidth: 120,
	plugins: ["prettier-plugin-svelte", "prettier-plugin-css-order"],
	overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
};

export default config;
