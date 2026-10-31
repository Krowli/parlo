// Run after `npm run build`: the installed layout (dist/, drizzle/, skills/) must work without src/.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bin = new URL('../bin/parlo.mjs', import.meta.url).pathname
const home = mkdtempSync(join(tmpdir(), 'parlo-smoke-'))
const env = { ...process.env, PARLO_HOME: join(home, '.parlo'), HOME: home }
for (const name of ['CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_HOME']) delete env[name]

const run = (...args) => execFileSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' })
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
if (run('--version').trim() !== version) throw new Error('version mismatch')
if (run('threads') !== 'parlo: no threads yet.\n') throw new Error('threads failed: migrations not found from dist?')
run('connect', 'claude', '--yes')
if (!run('uninstall', '--yes').includes('Last step: npm uninstall -g parlo')) throw new Error('uninstall failed')
console.log('smoke ok')
