import { defineConfig, presetWind3, transformerVariantGroup } from 'unocss';

export default defineConfig({
	outputToCssLayers: true,
	presets: [presetWind3({ dark: 'media' })],
	transformers: [transformerVariantGroup()]
});
