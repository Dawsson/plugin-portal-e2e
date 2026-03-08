# AGENTS.md

Instructions for agents working in `/Users/dawson/projects/plugin-portal/plugin-portal-e2e`.

## Goal

This repo is the visual and server-matrix E2E harness for Plugin Portal.

It owns:

- Bun/TypeScript CLI orchestration
- Docker topology generation and verification
- Prism client bootstrapping
- Fabric client automation mod
- recording/composition helpers
- artifacts, logs, timelines, and scenario execution

It does not own the Plugin Portal API or Paper plugin source. Those live in sibling repos:

- `/Users/dawson/projects/plugin-portal/api`
- `/Users/dawson/projects/plugin-portal/plugin`

## Commands

Run from this repo root:

```bash
bun install
bun run doctor
bun run bootstrap
bun run verify
bun run run:quick-local
bun run run:quick-prod
bun run verify:matrix
bun run e2e verify-matrix --only paper --kind standalone
bun run e2e verify-matrix --only velocity,waterfall --kind proxy
```

## CLI Model

Main entrypoint:

```bash
bun run e2e <command> [flags]
```

Commands:

- `doctor` checks local prerequisites
- `bootstrap` prepares local state, builds the client mod, and installs the Prism instance
- `run` executes a client-backed scenario run
- `record` executes a client-backed scenario run with recording enabled
- `clean` removes generated state and artifacts according to config
- `verify` runs the current config as a server-only validation
- `verify-matrix` runs server/proxy matrix verification without the Minecraft client

Useful flags:

- `--config <path>` loads a specific config file
- `verify-matrix --only <csv>` filters by family, project name, or service id
- `verify-matrix --kind standalone|proxy` filters the matrix by topology class

## Custom Topologies

For non-matrix work, prefer a config file plus `verify`.

Example:

```bash
bun run e2e verify --config e2e.config.proxy-two-paper.example.ts
```

Topology helper builders are exported from `packages/cli/src/config.ts`.

## Topology Terms

- `Compose generation` means writing the Docker Compose file and proxy config files.
- `Topology validation` means actually booting the generated stack, waiting for readiness, executing commands, checking logs, checking files, exporting artifacts, and tearing the stack down.

Compose is the runtime model. Validation is the proof layer on top of it.

## Artifact Layout

Each run writes a new folder under `artifacts/`:

- `screenshots/` captured images
- `video/` raw and composed recordings
- `logs/compose.log` streamed compose logs
- `logs/services/*.log` per-service logs
- `data/timeline.jsonl` structured timeline events
- `data/server-commands.jsonl` server-side command transcript
- `data/resolved-run.json` resolved config and compose path
- `data/run-summary.json` success/failure summary
- `data/file-explorer.svg` generated right-side panel snapshot

Matrix runs also emit:

- `artifacts/matrix-summary-<timestamp>.json`

## Scenario Model

Client-backed scenarios use steps like:

- `runCommand`
- `waitForChat`
- `clickChat`
- `takeScreenshot`
- `delay`

Server-only scenarios use steps like:

- `runServerCommand`
- `assertOutputContains`
- `waitForServiceLog`
- `waitForFile`
- `assertFileExists`

When extending scenario coverage, prefer assertions tied to real server effects:

- plugin jar written
- plugin metadata file changed
- service log line emitted
- command transcript contains the expected output

## Local State And Safety

Tracked `.env` currently contains non-secret defaults only. Do not put tokens or machine-private credentials there.

Machine-local or sensitive values belong in:

- `.env.local`
- `.e2e.local.json`
- `.obs.local.json`

Never commit:

- launcher account data
- API tokens
- OBS auth values
- raw artifacts unless explicitly requested

## Git

- Commit after each logical slice using `committer`
- Only commit files you intentionally changed
- Do not revert unrelated dirty files

## Current Gaps

Known incomplete areas:

- polished client/background lane
- clickable chat coverage breadth
- cleaner macOS Space/Desktop isolation
- richer composed right-side panel
- future auth/free/premium/version-source adapters

Track future product work in GitHub issues rather than burying it in code comments.
