import type { E2EConfig } from "../types.ts";

export function buildMatrixConfigs(base: E2EConfig): E2EConfig[] {
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
    scenarios: [
      {
        id: "version",
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
            action: "runServerCommand" as const,
            service: `${family}-main`,
            command: "pp version"
          },
          {
            action: "runServerCommand" as const,
            service: `${family}-main`,
            command: "pp list"
          }
        ]
      }
    ]
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
            action: "runServerCommand" as const,
            service: "paper-main",
            command: "pp version"
          }
        ]
      }
    ]
  }));

  return [...standalone, ...proxied];
}
