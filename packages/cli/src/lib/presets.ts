import type { E2EConfig } from "../types.ts";
import { backendNode, createProxyTopology, createStandaloneTopology, proxyNode } from "../config.ts";

export type ConfigPreset =
  | "quick-local"
  | "quick-prod"
  | "proxy-local"
  | "velocity-two-paper"
  | "waterfall-two-paper"
  | "bungeecord-two-paper";

function serverScenarios(backends: string[]): E2EConfig["scenarios"] {
  return [
    {
      id: "backend-version-checks",
      kind: "scripted",
      steps: backends.flatMap((service) => ([
        { action: "runServerCommand" as const, service, command: "plugins" },
        { action: "assertOutputContains" as const, value: "PluginPortal" },
        { action: "delay" as const, delayMs: 500 },
        { action: "runServerCommand" as const, service, command: "pp version" },
        { action: "delay" as const, delayMs: 500 },
        { action: "runServerCommand" as const, service, command: "pp info" },
        { action: "delay" as const, delayMs: 500 }
      ]))
    }
  ];
}

function applySinglePaper(base: E2EConfig): E2EConfig {
  return {
    ...base,
    topology: createStandaloneTopology(backendNode("paper-main", "paper", "1.21.4"))
  };
}

function applyTwoPaperProxy(base: E2EConfig, family: "velocity" | "waterfall" | "bungeecord"): E2EConfig {
  const backends = [
    backendNode("paper-lobby", "paper", "1.21.4"),
    backendNode("paper-admin", "paper", "1.21.4")
  ];

  return {
    ...base,
    projectName: `${base.projectName}-${family}-two-paper`,
    topology: createProxyTopology({
      backends,
      proxy: proxyNode(`${family}-main`, family, "latest", backends.map((server) => server.id))
    })
  };
}

export function applyPreset(base: E2EConfig, preset: string | undefined, command: string): E2EConfig {
  switch (preset as ConfigPreset | undefined) {
    case undefined:
      return base;
    case "quick-local":
      return {
        ...applySinglePaper(base),
        apiTarget: {
          mode: "custom",
          baseUrl: process.env.PP_E2E_API_LOCAL_URL ?? "https://api.dawson.gg"
        }
      };
    case "quick-prod":
      return {
        ...applySinglePaper(base),
        apiTarget: {
          mode: "production",
          baseUrl: "https://v3.pluginportal.link"
        }
      };
    case "proxy-local":
      return {
        ...base,
        apiTarget: {
          mode: "custom",
          baseUrl: process.env.PP_E2E_API_LOCAL_URL ?? "https://api.dawson.gg"
        },
        topology: createProxyTopology({
          backends: [backendNode("paper-main", "paper", "1.21.4")],
          proxy: proxyNode("velocity-main", "velocity", "latest", ["paper-main"])
        }),
        ...(command === "verify" || command === "verify-matrix"
          ? { scenarios: serverScenarios(["paper-main"]) }
          : {})
      };
    case "velocity-two-paper":
      return {
        ...applyTwoPaperProxy(base, "velocity"),
        ...(command === "verify" || command === "verify-matrix"
          ? { scenarios: serverScenarios(["paper-lobby", "paper-admin"]) }
          : {})
      };
    case "waterfall-two-paper":
      return {
        ...applyTwoPaperProxy(base, "waterfall"),
        ...(command === "verify" || command === "verify-matrix"
          ? { scenarios: serverScenarios(["paper-lobby", "paper-admin"]) }
          : {})
      };
    case "bungeecord-two-paper":
      return {
        ...applyTwoPaperProxy(base, "bungeecord"),
        ...(command === "verify" || command === "verify-matrix"
          ? { scenarios: serverScenarios(["paper-lobby", "paper-admin"]) }
          : {})
      };
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}
