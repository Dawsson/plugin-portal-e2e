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
  if (config.topology.servers.some((candidate) => isProxyFamily(candidate.family) && (candidate.backends ?? []).includes(node.id))) {
    environment.push("      OVERRIDE_SERVER_PROPERTIES: true");
  }
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

function proxyService(root: string, config: E2EConfig, node: ServerNode): string {
  if (!isProxyFamily(node.family)) {
    throw new Error(`Expected proxy family, received ${node.family}`);
  }
  const configMount = proxyConfigDir(root, config.projectName, node.id);
  return [
    `  ${node.id}:`,
    "    image: itzg/mc-proxy:latest",
    "    environment:",
    `      TYPE: ${proxyTypeFor(node.family)}`,
    "      ONLINE_MODE: \"FALSE\"",
    "      REPLACE_ENV_VARIABLES: \"TRUE\"",
    "    ports:",
    ...(node.family === "velocity" ? ["      - \"25565:25565\""] : ["      - \"25565:25577\""]),
    "    volumes:",
    `      - ${configMount}:/config:ro`
  ].join("\n");
}

function proxyConfigDir(root: string, projectName: string, nodeId: string): string {
  return resolve(root, ".state/generated", projectName, "proxy", nodeId, "config");
}

function writeBackendProxyConfig(root: string, config: E2EConfig): void {
  const proxiedBackends = new Set(
    config.topology.servers
      .filter((node) => isProxyFamily(node.family))
      .flatMap((node) => node.backends ?? [])
  );

  for (const backend of config.topology.servers) {
    if (!isServerFamily(backend.family) || !proxiedBackends.has(backend.id)) {
      continue;
    }

    const runtimeRoot = resolve(root, ".state/runtime", backend.id);
    ensureDir(runtimeRoot);
    const spigotConfig = [
      "settings:",
      "  bungeecord: true"
    ].join("\n");
    Bun.write(join(runtimeRoot, "spigot.yml"), `${spigotConfig}\n`);
  }
}

function velocityConfig(node: ServerNode): string {
  const backends = node.backends ?? [];
  const first = backends[0] ?? "";
  const servers = backends
    .map((backend) => `  ${backend} = "${backend}:25565"`)
    .join("\n");

  return [
    `bind = "0.0.0.0:25565"`,
    'motd = "Plugin Portal E2E"',
    "online-mode = false",
    `player-info-forwarding-mode = "${node.forwardingMode ?? "legacy"}"`,
    "",
    "[servers]",
    servers,
    "",
    `try = ["${first}"]`
  ].join("\n");
}

function waterfallConfig(node: ServerNode): string {
  const backends = node.backends ?? [];
  const first = backends[0] ?? "";
  const servers = backends
    .map((backend) => `  ${backend}:\n    address: ${backend}:25565\n    motd: '${backend}'\n    restricted: false`)
    .join("\n");

  return [
    "listeners:",
    "  - host: 0.0.0.0:25577",
    `    priorities: [${first}]`,
    "    bind_local_address: true",
    "    ping_passthrough: false",
    "    query_enabled: false",
    "ip_forward: true",
    "online_mode: false",
    "servers:",
    servers
  ].join("\n");
}

function writeProxyConfigs(root: string, config: E2EConfig): void {
  for (const node of config.topology.servers) {
    if (!isProxyFamily(node.family)) {
      continue;
    }
    const dir = proxyConfigDir(root, config.projectName, node.id);
    ensureDir(dir);
    const filename = node.family === "velocity" ? "velocity.toml" : "config.yml";
    const contents = node.family === "velocity" ? velocityConfig(node) : waterfallConfig(node);
    Bun.write(join(dir, filename), `${contents}\n`);
  }
}

export function generateComposeYaml(root: string, config: E2EConfig, release: ResolvedRelease): string {
  const services: string[] = [];
  const hasProxy = config.topology.servers.some((server) => isProxyFamily(server.family));
  for (const [index, server] of config.topology.servers.entries()) {
    if (isServerFamily(server.family)) {
      services.push(backendService(server, config, release, !hasProxy && index === 0));
    } else if (isProxyFamily(server.family)) {
      services.push(proxyService(root, config, server));
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
  writeBackendProxyConfig(root, config);
  writeProxyConfigs(root, config);
  const composePath = join(stateRoot, "docker-compose.yml");
  Bun.write(composePath, `${generateComposeYaml(root, config, release)}\n`);
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
