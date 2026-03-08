import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { LocalState } from "../types.ts";
import { ensureParent } from "./fs.ts";

const STATE_FILE = ".e2e.local.json";

export function getStatePath(root: string): string {
  return resolve(root, STATE_FILE);
}

export async function loadLocalState(root: string): Promise<LocalState> {
  const statePath = getStatePath(root);
  if (!existsSync(statePath)) return {};
  return JSON.parse(await readFile(statePath, "utf8")) as LocalState;
}

export async function saveLocalState(root: string, state: LocalState): Promise<void> {
  const statePath = getStatePath(root);
  ensureParent(statePath);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

