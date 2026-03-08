import { z } from "zod";

const apiTargetSchema = z.object({
  mode: z.enum(["local", "production", "custom"]),
  baseUrl: z.string().url()
});

const releaseSourceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("local-build"),
    pluginRepoPath: z.string()
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
  version: z.string()
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
    name: z.string()
  }),
  z.object({
    action: z.literal("clickChat"),
    text: z.string()
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
      instanceName: z.string()
    })
  }),
  topology: z.object({
    preset: z.enum(["single-paper", "paper-family", "proxy-velocity", "proxy-waterfall", "proxy-bungeecord", "full"]),
    servers: z.array(serverSchema).min(1)
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

