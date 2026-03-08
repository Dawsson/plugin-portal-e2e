import { join, resolve } from "node:path";
import type { E2EConfig, ProxyFamily, ServerFamily, ServerNode } from "../types.ts";
import { ensureDir } from "./fs.ts";
import { runCommand } from "./exec.ts";
import type { ResolvedRelease } from "./release.ts";

function backendImageFor(family: ServerFamily): string {
  return "itzg/minecraft-server:latest";
}

function backendTypeFor(family: ServerFamily): string {
  switch (family) {
    case "paper":
      return "PAPER";
    case "purpur":
      return "PURPUR";
    case "pufferfish":
      return "PUFFERFISH";
    case "spigot":
      return "SPIGOT";
  }
}

function isProxyFamily(family: ServerNode["family"]): family is ProxyFamily {
  return family === "velocity" || family === "waterfall" || family === "bungeecord";
}

function isServerFamily(family: ServerNode["family"]): family is ServerFamily {
  return family === "paper" || family === "purpur" || family === "pufferfish" || family === "spigot";
}

function proxyTypeFor(family: ProxyFamily): string {
  switch (family) {
    case "velocity":
      return "VELOCITY";
    case "waterfall":
      return "WATERFALL";
    case "bungeecord":
      return "BUNGEECORD";
  }
}

function backendService(node: ServerNode, config: E2EConfig, release: ResolvedRelease, exposeOnHost: boolean): string {
  if (!isServerFamily(node.family)) {
    throw new Error(`Expected backend family, received ${node.family}`);
  }
  const volumes = [
    `      - ${resolve(`.state/runtime/${node.id}`)}:/data`
  ];
  const operator = process.env.PP_E2E_PLAYER_USERNAME ?? config.client.prism.profile ?? "Dawsson";
  const environment = [
    "    environment:",
    `      TYPE: ${backendTypeFor(node.family)}`,
    `      VERSION: ${node.version}`,
    "      EULA: \"TRUE\"",
    "      ONLINE_MODE: \"FALSE\"",
    "      DIFFICULTY: peaceful",
    `      OPS: ${operator}`,
    "      MEMORY: 2G"
  ];
  if (config.apiTarget.mode !== "production") {
    environment.push(`      JVM_DD_OPTS: -Dpluginportal.baseUrl=${config.apiTarget.baseUrl} -Dpluginportal.wsBaseUrl=${config.apiTarget.baseUrl.replace("https://", "wss://").replace("http://", "ws://")}`)
  }
  if (release.kind === "url") {
    environment.push(`      PLUGINS: ${release.value}`)
  } else {
    volumes.push(`      - ${release.value}:/plugins/${release.filename}:ro`)
  }
  return [
    `  ${node.id}:`,
    `    image: ${backendImageFor(node.family)}`,
    ...environment,
    ...(exposeOnHost ? ["    ports:", "      - \"25565:25565\""] : []),
    "    volumes:",
    ...volumes
  ].join("\n");
}

function proxyService(node: ServerNode): string {
  if (!isProxyFamily(node.family)) {
    throw new Error(`Expected proxy family, received ${node.family}`);
  }
  return [
    `  ${node.id}:`,
    "    image: itzg/mc-proxy:latest",
    "    environment:",
    `      TYPE: ${proxyTypeFor(node.family)}`,
    "      ONLINE_MODE: \"FALSE\"",
    "    ports:",
    "      - \"25577:25577\""
  ].join("\n");
}

export function generateComposeYaml(config: E2EConfig, release: ResolvedRelease): string {
  const services: string[] = [];
  const hasProxy = config.topology.servers.some((server) => isProxyFamily(server.family));
  for (const [index, server] of config.topology.servers.entries()) {
    if (isServerFamily(server.family)) {
      services.push(backendService(server, config, release, !hasProxy && index === 0));
    } else if (isProxyFamily(server.family)) {
      services.push(proxyService(server));
    }
  }
  return [
    "services:",
    ...services
  ].join("\n");
}

export function writeComposeFile(root: string, config: E2EConfig, release: ResolvedRelease): string {
  const stateRoot = resolve(root, ".state/generated", config.projectName);
  ensureDir(stateRoot);
  ensureDir(resolve(root, ".state/runtime"));
  const composePath = join(stateRoot, "docker-compose.yml");
  Bun.write(composePath, `${generateComposeYaml(config, release)}\n`);
  return composePath;
}

export function dockerComposeUp(composePath: string, root: string): void {
  const result = runCommand(["docker", "compose", "-f", composePath, "up", "-d"], root);
  if (!result.ok) {
    throw new Error(`docker compose up failed\n${result.stderr}`);
  }
}

export function dockerComposeDown(composePath: string, root: string, wipeVolumes = false): void {
  const args = ["docker", "compose", "-f", composePath, "down"];
  if (wipeVolumes) args.push("-v");
  const result = runCommand(args, root);
  if (!result.ok) {
    throw new Error(`docker compose down failed\n${result.stderr}`);
  }
}

export async function waitForServiceLog(
  composePath: string,
  root: string,
  service: string,
  pattern: RegExp,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = runCommand(
      ["docker", "compose", "-f", composePath, "logs", "--no-color", "--tail=200", service],
      root
    );

    if (result.ok && pattern.test(result.stdout)) {
      return;
    }

    await Bun.sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${service} logs to match ${pattern}`);
}
