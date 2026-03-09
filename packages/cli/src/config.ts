import { z } from "zod";

const apiTargetSchema = z.object({
  mode: z.enum(["local", "production", "custom"]),
  baseUrl: z.string().url()
});

const releaseSourceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("local-build"),
    pluginRepoPath: z.string(),
    variant: z.enum(["free", "premium"]).default("free")
  }),
  z.object({
    mode: z.literal("local-path"),
    path: z.string()
  }),
  z.object({
    mode: z.literal("api-local")
  }),
  z.object({
    mode: z.literal("api-production")
  }),
  z.object({
    mode: z.literal("url"),
    url: z.string().url()
  })
]);

const serverSchema = z.object({
  id: z.string(),
  family: z.enum(["paper", "purpur", "pufferfish", "spigot", "velocity", "waterfall", "bungeecord"]),
  version: z.string(),
  backends: z.array(z.string()).optional(),
  forwardingMode: z.enum(["modern", "legacy"]).optional()
});

const stepSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("runCommand"),
    value: z.string()
  }),
  z.object({
    action: z.literal("waitForChat"),
    value: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    action: z.literal("takeScreenshot"),
    name: z.string(),
    delayMs: z.number().int().nonnegative().optional(),
    openChat: z.boolean().optional()
  }),
  z.object({
    action: z.literal("clickChat"),
    text: z.string()
  }),
  z.object({
    action: z.literal("delay"),
    delayMs: z.number().int().nonnegative()
  }),
  z.object({
    action: z.literal("runServerCommand"),
    service: z.string(),
    command: z.string(),
    console: z.boolean().optional()
  }),
  z.object({
    action: z.literal("assertOutputContains"),
    value: z.string()
  }),
  z.object({
    action: z.literal("waitForServiceLog"),
    service: z.string(),
    pattern: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    action: z.literal("waitForFile"),
    service: z.string(),
    pattern: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    action: z.literal("waitForFileChange"),
    service: z.string(),
    pattern: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    action: z.literal("waitForFileContains"),
    service: z.string(),
    path: z.string(),
    value: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    action: z.literal("assertFileExists"),
    service: z.string(),
    path: z.string()
  }),
  z.object({
    action: z.literal("assertFileContains"),
    service: z.string(),
    path: z.string(),
    value: z.string()
  }),
  z.object({
    action: z.literal("restartService"),
    service: z.string(),
    timeoutMs: z.number().int().positive().optional()
  })
]);

const scenarioSchema = z.object({
  id: z.string(),
  kind: z.literal("scripted"),
  steps: z.array(stepSchema).min(1)
});

export const e2eConfigSchema = z.object({
  projectName: z.string(),
  artifactsDir: z.string(),
  apiTarget: apiTargetSchema,
  releaseSource: releaseSourceSchema,
  client: z.object({
    minecraftVersion: z.string(),
    prism: z.object({
      appPath: z.string(),
      instanceName: z.string(),
      profile: z.string().optional()
    }),
    macos: z.object({
      launchMode: z.enum(["foreground", "background", "fullscreen-space"]).optional()
    }).optional()
  }),
  cleanup: z.object({
    closeClient: z.boolean().default(true),
    stopContainers: z.boolean().default(true),
    wipeVolumes: z.boolean().default(false)
  }),
  recording: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(["native", "ffmpeg", "none"]).default("none"),
    composeRightPanel: z.boolean().default(true),
    panelWidth: z.number().int().positive().default(480)
  }),
  topology: z.object({
    preset: z.enum(["single-paper", "paper-family", "proxy-velocity", "proxy-waterfall", "proxy-bungeecord", "full", "custom"]),
    servers: z.array(serverSchema).min(1),
    exposeHostPorts: z.boolean().default(true),
    hostPort: z.number().int().min(1).max(65535).optional()
  }).superRefine((topology, ctx) => {
    const proxies = topology.servers.filter((server) =>
      server.family === "velocity" || server.family === "waterfall" || server.family === "bungeecord"
    );
    if (proxies.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one proxy is supported per topology right now"
      });
    }
    const ids = new Set(topology.servers.map((server) => server.id));
    for (const server of proxies) {
      for (const backend of server.backends ?? []) {
        if (!ids.has(backend)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Proxy ${server.id} references unknown backend ${backend}`
          });
        }
      }
    }
  }),
  watch: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([])
  }),
  scenarios: z.array(scenarioSchema).min(1)
});

export type E2EConfig = z.infer<typeof e2eConfigSchema>;
export type ScenarioStep = z.infer<typeof stepSchema>;

export function defineConfig(config: E2EConfig): E2EConfig {
  return e2eConfigSchema.parse(config);
}

export function backendNode(
  id: string,
  family: "paper" | "purpur" | "pufferfish" | "spigot",
  version: string
): E2EConfig["topology"]["servers"][number] {
  return { id, family, version };
}

export function proxyNode(
  id: string,
  family: "velocity" | "waterfall" | "bungeecord",
  version: string,
  backends: string[],
  forwardingMode: "modern" | "legacy" = "legacy"
): E2EConfig["topology"]["servers"][number] {
  return { id, family, version, backends, forwardingMode };
}

export function createStandaloneTopology(
  backend: E2EConfig["topology"]["servers"][number]
): E2EConfig["topology"] {
  return {
    preset: "custom",
    servers: [backend],
    exposeHostPorts: true,
    hostPort: 25565
  };
}

export function createProxyTopology(options: {
  proxy: E2EConfig["topology"]["servers"][number];
  backends: E2EConfig["topology"]["servers"][number][];
}): E2EConfig["topology"] {
  return {
    preset: "custom",
    servers: [...options.backends, options.proxy],
    exposeHostPorts: true,
    hostPort: 25565
  };
}
