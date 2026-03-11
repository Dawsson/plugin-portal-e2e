import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ClientConfig, LocalState } from "../types.ts";
import { ensureDir } from "./fs.ts";

function expandHome(path: string): string {
  return path.startsWith("~/") ? resolve(process.env.HOME ?? "", path.slice(2)) : path;
}

function instanceCfg(client: ClientConfig): string {
  return `[General]
AutoCloseConsole=false
AutomaticJava=true
CloseAfterLaunch=false
ConfigVersion=1.2
InstanceType=OneSix
JoinServerOnLaunch=false
JoinServerOnLaunchAddress=
ManagedPack=false
OverrideJavaLocation=false
OverrideMemory=false
ShowConsole=false
UseAccountForInstance=false
iconKey=default
name=${client.prism.instanceName}
`;
}

function mmcPack(client: ClientConfig): string {
  return JSON.stringify(
    {
      components: [
        {
          uid: "net.minecraft",
          version: client.minecraftVersion
        },
        {
          uid: "net.fabricmc.intermediary",
          version: client.minecraftVersion
        },
        {
          uid: "net.fabricmc.fabric-loader",
          version: "0.18.4"
        }
      ],
      formatVersion: 1
    },
    null,
    2
  );
}

type FabricDependency = {
  artifactId: string;
  version: string;
};

function readGradleProperty(root: string, key: string): string {
  const gradleProperties = readFileSync(join(root, "gradle.properties"), "utf8");
  const line = gradleProperties
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));

  if (!line) {
    throw new Error(`Missing ${key} in gradle.properties`);
  }

  return line.slice(key.length + 1).trim();
}

function resolveCachedJar(root: string, dependency: FabricDependency): string {
  const cacheRoot = resolve(
    process.env.HOME ?? "",
    ".gradle/caches/modules-2/files-2.1",
    ...dependency.artifactId.split("/"),
    dependency.version
  );

  if (!existsSync(cacheRoot)) {
    throw new Error(`Gradle cache missing ${dependency.artifactId}:${dependency.version}`);
  }

  const jarName = `${dependency.artifactId.split("/").at(-1)}-${dependency.version}.jar`;
  const candidates = [];
  for (const hashDir of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!hashDir.isDirectory()) {
      continue;
    }
    const candidate = join(cacheRoot, hashDir.name, jarName);
    if (existsSync(candidate)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Could not find ${jarName} in Gradle cache`);
  }

  return candidates[0]!;
}

function syncDependencyJar(modsDir: string, jarPath: string): void {
  const filename = basename(jarPath);
  const targetPath = join(modsDir, filename);
  copyFileSync(jarPath, targetPath);
}

function writeAutomationOptions(minecraftDir: string): void {
  const optionsPath = join(minecraftDir, "options.txt");
  const existing = existsSync(optionsPath) ? readFileSync(optionsPath, "utf8") : "";
  const values = new Map<string, string>();

  for (const line of existing.split(/\r?\n/)) {
    if (!line.includes(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    values.set(key, value);
  }

  const overrides: Record<string, string> = {
    fullscreen: "false",
    guiScale: "4",
    onboardAccessibility: "false",
    tutorialStep: "none",
    pauseOnLostFocus: "false",
    skipMultiplayerWarning: "true",
    joinedFirstServer: "true",
    overrideWidth: "1280",
    overrideHeight: "720",
    chatHeightFocused: "1.0",
    chatHeightUnfocused: "1.0",
    chatScale: "1.0",
    chatWidth: "1.0",
    textBackgroundOpacity: "0.5",
    backgroundForChatOnly: "true"
  };

  for (const [key, value] of Object.entries(overrides)) {
    values.set(key, value);
  }

  const lines = [...values.entries()].map(([key, value]) => `${key}:${value}`);
  writeFileSync(optionsPath, `${lines.join("\n")}\n`, "utf8");
}

export async function ensurePrismInstance(
  root: string,
  client: ClientConfig,
  state: LocalState,
  modJarPath: string
): Promise<string> {
  const instanceRoot = expandHome(
    state.prismInstanceRoot ?? "~/Library/Application Support/PrismLauncher/instances"
  );
  const instanceDir = join(instanceRoot, client.prism.instanceName);
  const minecraftDir = join(instanceDir, "minecraft");
  const modsDir = join(minecraftDir, "mods");
  const serversPath = join(minecraftDir, "servers.dat");

  ensureDir(instanceDir);
  ensureDir(minecraftDir);
  ensureDir(modsDir);

  writeFileSync(join(instanceDir, "instance.cfg"), instanceCfg(client), "utf8");
  writeFileSync(join(instanceDir, "mmc-pack.json"), `${mmcPack(client)}\n`, "utf8");

  const files = await readdir(modsDir);
  for (const file of files) {
    if (
      (file.startsWith("plugin-portal-e2e-client-") ||
        file.startsWith("fabric-api-") ||
        file.startsWith("fabric-language-kotlin-")) &&
      file.endsWith(".jar")
    ) {
      rmSync(join(modsDir, file), { force: true });
    }
  }

  const targetModJar = join(modsDir, basename(modJarPath));
  copyFileSync(modJarPath, targetModJar);

  const fabricApiVersion = readGradleProperty(root, "fabric_version");
  const fabricKotlinVersion = readGradleProperty(root, "fabric_kotlin_version");
  const dependencyJars = [
    resolveCachedJar(root, {
      artifactId: "net.fabricmc.fabric-api/fabric-api",
      version: fabricApiVersion
    }),
    resolveCachedJar(root, {
      artifactId: "net.fabricmc/fabric-language-kotlin",
      version: fabricKotlinVersion
    })
  ];

  for (const jarPath of dependencyJars) {
    syncDependencyJar(modsDir, jarPath);
  }

  // Keep the multiplayer list deterministic so automation does not select a stale hidden server.
  rmSync(serversPath, { force: true });
  writeAutomationOptions(minecraftDir);

  const groupFile = join(instanceRoot, "instgroups.json");
  if (!existsSync(groupFile)) {
    writeFileSync(groupFile, "{\n  \"groups\": []\n}\n", "utf8");
  }

  return instanceDir;
}
