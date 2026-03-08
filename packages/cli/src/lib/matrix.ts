import type { E2EConfig } from "../types.ts";

export interface MatrixSelection {
  only?: Set<string>;
  kind?: "all" | "standalone" | "proxy";
}

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
        }
      ]
    },
    {
      id: "install-smoke",
      kind: "scripted" as const,
      steps: [
        {
          action: "runServerCommand" as const,
          service: `${family}-main`,
          command: "pp install ViaVersion HANGAR --exact"
        },
        {
          action: "waitForFile" as const,
          service: `${family}-main`,
          pattern: "plugins/*ViaVersion*.jar",
          timeoutMs: 120_000
        }
      ]
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

  const proxied = proxyFamilies.map((family) => ({
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
    scenarios: [
      {
        id: "proxy-ready",
        kind: "scripted" as const,
        steps: [
          {
            action: "waitForServiceLog" as const,
            service: "proxy-main",
            pattern: family === "velocity" ? "Listening on" : "Listening on /0.0.0.0:25577",
            timeoutMs: 60_000
          },
          {
            action: "delay" as const,
            delayMs: 500
          }
        ]
      },
      {
        id: "proxy-backend-version",
        kind: "scripted" as const,
        steps: [
          {
            action: "runServerCommand" as const,
            service: "paper-main",
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
            service: "paper-main",
            command: "pp version"
          }
        ]
      }
    ]
  }));

  const candidates = [
    ...(selection.kind === "proxy" ? [] : standalone),
    ...(selection.kind === "standalone" ? [] : proxied)
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
