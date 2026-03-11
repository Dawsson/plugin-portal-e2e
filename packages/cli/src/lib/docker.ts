import { randomUUID } from "node:crypto";
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

function configuredApiKey(): string | null {
  return process.env.PP_E2E_PLUGIN_PORTAL_API_KEY?.trim() || null;
}

function jvmOptsFor(config: E2EConfig, gatewayNetworkId: string): string {
  const options = [`-Dpluginportal.gatewayNetworkId=${gatewayNetworkId}`];
  if (config.apiTarget.mode !== "production") {
    options.push(`-Dpluginportal.baseUrl=${config.apiTarget.baseUrl}`);
    options.push(`-Dpluginportal.wsBaseUrl=${config.apiTarget.baseUrl.replace("https://", "wss://").replace("http://", "ws://")}`);
  }
  return options.join(" ");
}

function backendService(node: ServerNode, config: E2EConfig, release: ResolvedRelease, exposeOnHost: boolean, gatewayNetworkId: string): string {
  if (!isServerFamily(node.family)) {
    throw new Error(`Expected backend family, received ${node.family}`);
  }
  const hostPort = config.topology.hostPort ?? 25565;
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
    "      ENABLE_RCON: \"TRUE\"",
    "      CREATE_CONSOLE_IN_PIPE: \"TRUE\"",
    "      RCON_PASSWORD: \"plugin-portal-e2e\"",
    "      MEMORY: 2G",
    `      JVM_OPTS: ${jvmOptsFor(config, gatewayNetworkId)}`
  ];
  if (config.topology.servers.some((candidate) => isProxyFamily(candidate.family) && (candidate.backends ?? []).includes(node.id))) {
    environment.push("      OVERRIDE_SERVER_PROPERTIES: true");
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
    ...(exposeOnHost && config.topology.exposeHostPorts !== false ? ["    ports:", `      - "${hostPort}:25565"`] : []),
    "    volumes:",
    ...volumes
  ].join("\n");
}

function proxyService(root: string, config: E2EConfig, node: ServerNode, release: ResolvedRelease, gatewayNetworkId: string): string {
  if (!isProxyFamily(node.family)) {
    throw new Error(`Expected proxy family, received ${node.family}`);
  }
  const hostPort = config.topology.hostPort ?? 25565;
  const configMount = proxyConfigDir(root, config.projectName, node.id);
  const pluginDataMount = resolve(root, ".state/runtime", node.id, "pluginportal");
  ensureDir(pluginDataMount);
  const volumes = [`      - ${configMount}:/config:ro`, `      - ${pluginDataMount}:/server/plugins/pluginportal`];
  const environment = [
    "    environment:",
    `      TYPE: ${proxyTypeFor(node.family)}`,
    "      ONLINE_MODE: \"FALSE\"",
    "      REPLACE_ENV_VARIABLES: \"TRUE\"",
    `      JVM_OPTS: ${jvmOptsFor(config, gatewayNetworkId)}`
  ];
  if (release.kind === "url") {
    environment.push(`      PLUGINS: ${release.value}`);
  } else {
    volumes.push(`      - ${release.value}:/plugins/${release.filename}:ro`);
  }
  return [
    `  ${node.id}:`,
    "    image: itzg/mc-proxy:latest",
    ...environment,
    ...(config.topology.exposeHostPorts === false
      ? []
      : ["    ports:", ...(node.family === "velocity" ? [`      - "${hostPort}:25565"`] : [`      - "${hostPort}:25577"`])]),
    "    volumes:",
    ...volumes
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

function writePluginPortalConfigs(root: string, config: E2EConfig): void {
  const apiKey = configuredApiKey();

  for (const node of config.topology.servers) {
    if (isServerFamily(node.family)) {
      const configPath = resolve(root, ".state/runtime", node.id, "plugins", "PluginPortal", "config.yml");
      ensureDir(resolve(root, ".state/runtime", node.id, "plugins", "PluginPortal"));
      const lines = [
        "Gateway:",
        "  Enabled: true",
      ];
      if (apiKey) {
        lines.push("Authentication:");
        lines.push(`  ApiKey: ${apiKey}`);
      }
      Bun.write(configPath, `${lines.join("\n")}\n`);
      continue;
    }

    if (isProxyFamily(node.family)) {
      const proxyDataRoot = resolve(root, ".state/runtime", node.id, "pluginportal");
      ensureDir(proxyDataRoot);
      const configPath = join(proxyDataRoot, "config.json");
      const payload: Record<string, unknown> = {
        Gateway: {
          Enabled: true,
        },
      };
      if (apiKey) {
        payload.Authentication = {
          ApiKey: apiKey,
        };
      }
      Bun.write(configPath, `${JSON.stringify(payload, null, 2)}\n`);
    }
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
    "forced-hosts = {}",
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
    "    forced_hosts: {}",
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

export function generateComposeYaml(root: string, config: E2EConfig, release: ResolvedRelease, gatewayNetworkId: string): string {
  const services: string[] = [];
  const hasProxy = config.topology.servers.some((server) => isProxyFamily(server.family));
  for (const [index, server] of config.topology.servers.entries()) {
    if (isServerFamily(server.family)) {
      services.push(backendService(server, config, release, !hasProxy && index === 0, gatewayNetworkId));
    } else if (isProxyFamily(server.family)) {
      services.push(proxyService(root, config, server, release, gatewayNetworkId));
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
  const gatewayNetworkId = randomUUID();
  writeBackendProxyConfig(root, config);
  writeProxyConfigs(root, config);
  writePluginPortalConfigs(root, config);
  const composePath = join(stateRoot, "docker-compose.yml");
  Bun.write(composePath, `${generateComposeYaml(root, config, release, gatewayNetworkId)}\n`);
  return composePath;
}

export function dockerComposeUp(composePath: string, root: string): void {
  const result = runCommand(["docker", "compose", "-f", composePath, "up", "-d", "--force-recreate"], root);
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

export function dockerComposeRestart(composePath: string, root: string, service: string): void {
  const result = runCommand(["docker", "compose", "-f", composePath, "restart", service], root);
  if (!result.ok) {
    throw new Error(`docker compose restart failed for ${service}\n${result.stderr}`);
  }
}

export async function waitForServiceLog(
  composePath: string,
  root: string,
  service: string,
  pattern: RegExp,
  timeoutMs: number,
  options: {
    since?: Date;
  } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const args = ["docker", "compose", "-f", composePath, "logs", "--no-color", "--tail=200"];
    if (options.since) {
      args.push("--since", options.since.toISOString());
    }
    args.push(service);
    const result = runCommand(
      args,
      root
    );

    if (result.ok && pattern.test(result.stdout)) {
      return;
    }

    await Bun.sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${service} logs to match ${pattern}`);
}
