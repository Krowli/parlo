# Contributing to parlo

Thanks for helping. Issues and pull requests are welcome on [GitHub](https://github.com/Krowli/parlo).

## Set up

```bash
git clone https://github.com/Krowli/parlo.git
cd parlo
npm ci                 # if NODE_ENV=production is set in your shell: npm ci --include=dev
npm run parlo -- --help
```

Node `^22.19.0 || >=24.11.0`, on macOS or Linux.

## Tests

```bash
npm test               # vitest
npm run typecheck
npm run build && npm run smoke   # the built package, run from dist/
```

The tests never start your real `codex` or `claude`. `src/testing/fake-cli.ts` puts a fake one first on `PATH` that replays a recorded event stream from `src/testing/fixtures/` and records what it was given. Every test that runs `connect`, `disconnect` or `uninstall` points `HOME` at a temporary directory, so your own `~/.claude`, `~/.agents` and `~/.codex` are never touched.

`npm run …` puts `node_modules/.bin` first on `PATH`, and `@openai/codex-sdk` (a dev dependency, for its event types) installs a `codex` there. Under `npm run parlo` that one answers, not yours.

## Refreshing the recorded streams

When a CLI changes its output, record a fresh stream and update the fixture and the runner together (`src/runners/codex.ts` or `src/runners/claude.ts`):

```bash
echo 'Reply with exactly: pong' | codex exec --json --skip-git-repo-check -s read-only - > codex.jsonl
echo 'Reply with exactly: pong' | claude -p --output-format stream-json --verbose --permission-mode plan > claude.jsonl
```

Codex must get its prompt on stdin with stdin closed afterwards; with stdin left open it waits forever.

## Changing the database

Edit `src/store/schema.ts`, then generate a migration and commit it:

```bash
npm run generate -- --name <what-changed>
```

## Commits

Conventional style, as in the history: `feat(scope): …`, `fix(scope): …`, `test: …`, `docs: …`. Each commit leaves the tests green.

## License

By contributing you agree that your contribution is licensed under the project's [license](LICENSE).
