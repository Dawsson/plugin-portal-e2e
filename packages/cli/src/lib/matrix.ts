import type { E2EConfig } from "../types.ts";

export interface MatrixSelection {
  only?: Set<string>;
  kind?: "all" | "standalone" | "proxy";
}

const viaVersionUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

function standaloneScenarios(family: "paper" | "purpur" | "pufferfish" | "spigot") {
  return [
    {
      id: "server-smoke",
      kind: "scripted" as const,
      steps: [
        {
          action: "runServerCommand" as const,
          service: `${family}-main`,
          command: "plugins"
        },
        {
          action: "assertOutputContains" as const,
          value: "PluginPortal"
        },
        {
          action: "delay" as const,
          delayMs: 500
        },
        {
          action: "runServerCommand" as const,
          service: `${family}-main`,
          command: "pp version"
        },
        {
          action: "delay" as const,
          delayMs: 500
        },
        {
          action: "runServerCommand" as const,
          service: `${family}-main`,
          command: "pp info"
        },
        {
          action: "delay" as const,
          delayMs: 500
        },
        {
          action: "runServerCommand" as const,
          service: `${family}-main`,
          command: "pp list"
        },
        {
          action: "delay" as const,
          delayMs: 500
        },
        {
          action: "runServerCommand" as const,
          service: `${family}-main`,
          command: "pp install-url " + viaVersionUrl,
          console: true
        },
        {
          action: "waitForFile" as const,
          service: `${family}-main`,
          pattern: "plugins/ViaVersion-5.3.1.jar",
          timeoutMs: 120_000
        },
        {
          action: "restartService" as const,
          service: `${family}-main`,
          timeoutMs: 180_000
        },
        {
          action: "waitForFile" as const,
          service: `${family}-main`,
          pattern: "plugins/ViaVersion/config.yml",
          timeoutMs: 60_000
        },
        {
          action: "assertFileContains" as const,
          service: `${family}-main`,
          path: "plugins/ViaVersion/config.yml",
          value: "check-for-updates: true"
        }
      ]
    }
  ];
}

function proxyScenarios(proxyId: string, family: "velocity" | "waterfall" | "bungeecord", backends: string[]) {
  const readyPattern = family === "velocity" ? "Listening on" : "Listening on /0.0.0.0:25577";
  const backendChecks = backends.flatMap((service) => ([
    {
      action: "runServerCommand" as const,
      service,
      command: "plugins"
    },
    {
      action: "assertOutputContains" as const,
      value: "PluginPortal"
    },
    {
      action: "delay" as const,
      delayMs: 500
    },
    {
      action: "runServerCommand" as const,
      service,
      command: "pp version"
    },
    {
      action: "delay" as const,
      delayMs: 500
    }
  ]));

  return [
    {
      id: "proxy-ready",
      kind: "scripted" as const,
      steps: [
        {
          action: "waitForServiceLog" as const,
          service: proxyId,
          pattern: readyPattern,
          timeoutMs: 60_000
        },
        {
          action: "delay" as const,
          delayMs: 500
        }
      ]
    },
    {
      id: "proxy-backends",
      kind: "scripted" as const,
      steps: backendChecks
    }
  ];
}

export function buildMatrixConfigs(base: E2EConfig, selection: MatrixSelection = {}): E2EConfig[] {
  const standaloneFamilies = ["paper", "purpur", "pufferfish", "spigot"] as const;
  const proxyFamilies = ["velocity", "waterfall", "bungeecord"] as const;

  const standalone = standaloneFamilies.map((family) => ({
    ...base,
    projectName: `${base.projectName}-${family}`,
    recording: {
      ...base.recording,
      enabled: false,
      provider: "none" as const
    },
    cleanup: {
      ...base.cleanup,
      closeClient: false
    },
    topology: {
      preset: "single-paper" as const,
      servers: [
        {
          id: `${family}-main`,
          family,
          version: "1.21.4"
        }
      ]
    },
    scenarios: standaloneScenarios(family)
  }));

  const proxiedSingle = proxyFamilies.map((family) => ({
    ...base,
    projectName: `${base.projectName}-${family}`,
    recording: {
      ...base.recording,
      enabled: false,
      provider: "none" as const
    },
    cleanup: {
      ...base.cleanup,
      closeClient: false
    },
    topology: {
      preset: (`proxy-${family}`) as E2EConfig["topology"]["preset"],
      servers: [
        {
          id: "paper-main",
          family: "paper" as const,
          version: "1.21.4"
        },
        {
          id: "proxy-main",
          family,
          version: "latest",
          backends: ["paper-main"],
          forwardingMode: "legacy" as const
        }
      ]
    },
    scenarios: proxyScenarios("proxy-main", family, ["paper-main"])
  }));

  const proxiedDouble = proxyFamilies.map((family) => ({
    ...base,
    projectName: `${base.projectName}-${family}-two-paper`,
    recording: {
      ...base.recording,
      enabled: false,
      provider: "none" as const
    },
    cleanup: {
      ...base.cleanup,
      closeClient: false
    },
    topology: {
      preset: "custom" as const,
      servers: [
        {
          id: "paper-lobby",
          family: "paper" as const,
          version: "1.21.4"
        },
        {
          id: "paper-admin",
          family: "paper" as const,
          version: "1.21.4"
        },
        {
          id: `${family}-main`,
          family,
          version: "latest",
          backends: ["paper-lobby", "paper-admin"],
          forwardingMode: "legacy" as const
        }
      ]
    },
    scenarios: proxyScenarios(`${family}-main`, family, ["paper-lobby", "paper-admin"])
  }));

  const candidates = [
    ...(selection.kind === "proxy" ? [] : standalone),
    ...(selection.kind === "standalone" ? [] : proxiedSingle),
    ...(selection.kind === "standalone" ? [] : proxiedDouble)
  ];

  const only = selection.only;

  if (!only || only.size === 0) {
    return candidates;
  }

  return candidates.filter((config) => {
    const names = new Set([
      config.projectName,
      ...config.topology.servers.map((server) => server.family),
      ...config.topology.servers.map((server) => server.id)
    ]);
    for (const token of only) {
      if (names.has(token)) {
        return true;
      }
    }
    return false;
  });
}
