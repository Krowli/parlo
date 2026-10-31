import { execFileSync } from 'node:child_process'

import { lastLine } from './runners/text'

/**
 * A git worktree for a colleague, at `path`, from the repository `repoCwd` is
 * in. Codex's own `--worktree` can't be used: a resumed Codex session runs in
 * the directory it is started from, not in the worktree it made, and Codex
 * never says where that worktree is. So parlo makes the worktree and gives its
 * path to Codex on every turn.
 */
export function makeWorktree(repoCwd: string, path: string): { ok: true } | { ok: false; reason: string } {
  try {
    execFileSync('git', ['-C', repoCwd, 'worktree', 'add', '--detach', path], { stdio: 'pipe' })
    return { ok: true }
  }
  catch (error) {
    const said = lastLine(String((error as { stderr?: Buffer }).stderr ?? ''))
    return { ok: false, reason: `--worktree needs a git repository with at least one commit (git: ${said})` }
  }
}
