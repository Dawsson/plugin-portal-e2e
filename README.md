# Plugin Portal E2E

Visual and server-matrix end-to-end harness for Plugin Portal.

This repo drives:

- Docker server and proxy topologies
- real Prism/Fabric client automation
- screenshot and native macOS window recording artifacts
- server-side matrix verification
- file/log/timeline capture

## Status

Working now:

- real Docker validation for `paper`, `purpur`, `pufferfish`, `spigot`
- real Docker validation for `velocity`, `waterfall`, `bungeecord`
- server-side command execution through RCON
- watched-file and log timelines
- generated run artifacts and matrix summaries

In progress:

- polished client/background lane
- broader clickable-chat coverage
- background/fullscreen-space capture polish

## Quick Start

```bash
bun install
bun run doctor
bun run bootstrap
bun run verify:matrix
```

## Scripts

```bash
bun run doctor
bun run bootstrap
bun run verify
bun run typecheck
bun run e2e help
bun run run:quick-local
bun run run:quick-prod
bun run run:proxy-local
bun run verify:matrix
bun run verify:velocity-two-paper
bun run e2e verify-matrix --only paper --kind standalone
bun run e2e verify-matrix --only velocity,waterfall --kind proxy
```

## Commands

Main entrypoint:

```bash
bun run e2e <command> [flags]
```

Supported commands:

- `doctor`
- `bootstrap`
- `verify`
- `run`
- `record`
- `clean`
- `verify-matrix`

Important flags:

- `--config <path>`
- `--preset <name>`
- `verify-matrix --only <csv>`
- `verify-matrix --kind standalone|proxy`

Built-in presets:

- `quick-local`
- `quick-prod`
- `proxy-local`
- `velocity-two-paper`
- `waterfall-two-paper`
- `bungeecord-two-paper`

## Custom Topologies

You can validate an arbitrary topology directly with `verify` or `run`.

Example:

```bash
bun run e2e verify --config e2e.config.proxy-two-paper.example.ts
```

Helper builders are exported from [config.ts](/Users/dawson/projects/plugin-portal/plugin-portal-e2e/packages/cli/src/config.ts):

- `backendNode`
- `proxyNode`
- `createStandaloneTopology`
- `createProxyTopology`

The two-backend proxy example lives in [e2e.config.proxy-two-paper.example.ts](/Users/dawson/projects/plugin-portal/plugin-portal-e2e/e2e.config.proxy-two-paper.example.ts).

You can also use presets for the most common operator flows without editing config:

```bash
bun run e2e verify --preset velocity-two-paper
bun run e2e run --preset proxy-local
```

## Config

Default config lives in [e2e.config.ts](/Users/dawson/projects/plugin-portal/plugin-portal-e2e/e2e.config.ts).
Reference example lives in [e2e.config.example.ts](/Users/dawson/projects/plugin-portal/plugin-portal-e2e/e2e.config.example.ts).

Important config surfaces:

- `apiTarget`
- `releaseSource`
- `client`
- `cleanup`
- `recording`
- `topology`
- `watch`
- `scenarios`

On macOS, `client.macos.launchMode` supports:

- `foreground`
- `background`
- `fullscreen-space`

The current default is `background`.

Recording now defaults to the native macOS window recorder through `screencapture`.

## Topology Validation

Compose is the final runtime model.

The harness does two separate things:

1. Generate the topology.
2. Validate that the topology actually works.

Validation means:

- bring the stack up
- wait for server or proxy readiness
- execute real commands
- inspect logs
- watch filesystem changes
- export artifacts
- tear the stack down

That is what `verify-matrix` now does.

The matrix now includes:

- standalone `paper`, `purpur`, `pufferfish`, `spigot`
- single-backend `velocity`, `waterfall`, `bungeecord`
- two-backend proxy topologies for `velocity`, `waterfall`, `bungeecord`

## Artifact Layout

Each run creates a new folder under `artifacts/`:

- `screenshots/`
- `video/`
- `logs/compose.log`
- `logs/services/*.log`
- `data/timeline.jsonl`
- `data/server-commands.jsonl`
- `data/resolved-run.json`
- `data/run-summary.json`
- `data/file-explorer.svg`

Matrix runs also write:

- `matrix-summary-<timestamp>.json`

## Local State

Tracked `.env` contains non-secret defaults only.

Use ignored local files for machine-specific or sensitive overrides:

- `.env.local`
- `.e2e.local.json`
- `.obs.local.json`

Do not commit:

- account data
- API tokens
- OBS auth secrets
- raw artifacts

## Related Repos

This repo assumes the sibling workspace layout:

- `/Users/dawson/projects/plugin-portal/api`
- `/Users/dawson/projects/plugin-portal/plugin`

## Current Gaps

- polished client/background isolation on macOS
- richer clickable-chat scenarios
- cleaner recording capture and composition defaults
- future auth/free/premium/version adapter layer
