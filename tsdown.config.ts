import { defineConfig } from 'tsdown'

/**
 * `dist/cli.mjs`, which `bin/parlo.mjs` imports. Dependencies stay external:
 * parlo is installed from npm with its `node_modules`, and better-sqlite3 is a
 * native module a bundler can't inline.
 */
export default defineConfig({
  entry: { cli: 'src/cli/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outExtensions: () => ({ js: '.mjs' }),
  sourcemap: false,
  clean: true,
  dts: false,
})
