# Plugin Portal E2E

Visual end-to-end test harness for Plugin Portal using:

- Docker for server and proxy topologies
- Prism Launcher for real client launches
- A Kotlin Fabric client mod for client-side automation
- OBS for raw capture
- FFmpeg for post-processing

## Layout

- `packages/cli`: Bun/TypeScript orchestration
- `packages/client-mod`: Kotlin Fabric client automation mod
- `docker`: compose fragments and generated topology assets
- `scenarios`: reusable scenario definitions
- `obs`: OBS scene and profile assets
- `ffmpeg`: video composition assets

## Quick Start

```bash
bun install
bun run doctor
bun run bootstrap
bun run run:quick-local
```

## Local State

Machine-local configuration lives in ignored files:

- `.e2e.local.json`
- `.env.local`
- `.obs.local.json`

Do not commit tokens, launcher profiles, account data, or raw artifacts.

