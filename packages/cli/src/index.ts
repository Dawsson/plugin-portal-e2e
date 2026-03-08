import { resolve } from "node:path";
import { bootstrap } from "./commands/bootstrap.ts";
import { clean } from "./commands/clean.ts";
import { doctor } from "./commands/doctor.ts";
import { inspectChat } from "./commands/inspect-chat.ts";
import { runPreset } from "./commands/run.ts";
import { verifyConfig, verifyMatrix } from "./commands/verify.ts";
import { loadConfig } from "./lib/config.ts";
import { loadEnvFiles } from "./lib/env.ts";
import { applyPreset } from "./lib/presets.ts";

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function readMatrixSelection(args: string[]) {
  const only = readFlag(args, "--only")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const kind = readFlag(args, "--kind");

  return {
    only: only && only.length > 0 ? new Set(only) : undefined,
    kind: kind === "standalone" || kind === "proxy" ? kind : "all"
  } as const;
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "../../..");
  loadEnvFiles(root);
  const args = Bun.argv.slice(2);
  const command = args[0] ?? "doctor";
  const preset = readFlag(args, "--preset");
  const config = applyPreset(await loadConfig(root, readFlag(args, "--config")), preset, command);

  if (command === "help" || args.includes("--help")) {
    console.log([
      "Plugin Portal E2E",
      "",
      "Usage:",
      "  bun run e2e <command> [--config <path>] [--preset <name>]",
      "",
      "Commands:",
      "  doctor",
      "  bootstrap",
      "  run",
      "  record",
      "  clean",
      "  inspect-chat",
      "  verify",
      "  verify-matrix",
      "",
      "Presets:",
      "  quick-local",
      "  quick-prod",
      "  proxy-local",
      "  velocity-two-paper",
      "  waterfall-two-paper",
      "  bungeecord-two-paper",
      "",
      "Matrix flags:",
      "  --only <csv>",
      "  --kind standalone|proxy"
    ].join("\n"));
    return;
  }

  switch (command) {
    case "doctor":
      await doctor(config);
      return;
    case "bootstrap":
      await bootstrap(root, config);
      return;
    case "run": {
      await runPreset(root, config, "run");
      return;
    }
    case "record": {
      await runPreset(root, config, "record");
      return;
    }
    case "clean":
      await clean(root, config);
      return;
    case "inspect-chat":
      await inspectChat();
      return;
    case "verify":
      await verifyConfig(root, config);
      return;
    case "verify-matrix":
      await verifyMatrix(root, config, readMatrixSelection(args));
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

await main();
