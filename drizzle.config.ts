import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema',
	dialect: 'sqlite',
	dbCredentials: { url: './database.db' },
	verbose: true,
	strict: true
});
