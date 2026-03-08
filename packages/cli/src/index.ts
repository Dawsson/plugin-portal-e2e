import { resolve } from "node:path";
import { bootstrap } from "./commands/bootstrap.ts";
import { clean } from "./commands/clean.ts";
import { doctor } from "./commands/doctor.ts";
import { runPreset } from "./commands/run.ts";
import { loadConfig } from "./lib/config.ts";

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "../../..");
  const args = Bun.argv.slice(2);
  const command = args[0] ?? "doctor";
  const config = await loadConfig(root, readFlag(args, "--config"));

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
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

await main();
