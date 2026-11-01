import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A path inside the parlo package. This file runs from `src/` under tsx and
 * vitest, and from `dist/cli.mjs` once installed, so it walks up to the
 * package.json named `parlo` instead of assuming a depth.
 */
export function packagePath(...parts: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest) && (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === 'parlo-cli') {
      return join(dir, ...parts)
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error('parlo: cannot find its own package directory')
    }
    dir = parent
  }
}
