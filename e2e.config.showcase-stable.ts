import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-showcase-stable",
  watch: {
    include: ["plugins/*.jar", "plugins/ViaVersion/**", "plugins/PluginPortal/**"],
    exclude: ["**/*.tmp"]
  },
  scenarios: [
    {
      id: "showcase-stable",
      kind: "scripted",
      steps: [
        { action: "runCommand", value: "/pp", beforeDelayMs: 100, afterDelayMs: 220 },
        { action: "delay", delayMs: 350 },
        { action: "runCommand", value: "/pp info", beforeDelayMs: 100, afterDelayMs: 260 },
        { action: "delay", delayMs: 550 },
        { action: "runCommand", value: "/pp view ViaVersion HANGAR --byId", beforeDelayMs: 100, afterDelayMs: 320 },
        { action: "delay", delayMs: 1_200 },
        { action: "runServerCommand", service: "paper-main", command: "pp install P1OZGk5p MODRINTH --byId", console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/*ViaVersion*.jar", timeoutMs: 60_000 },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "connectClient", timeoutMs: 180_000 },
        { action: "delay", delayMs: 700 },
        { action: "runCommand", value: "/pp list", beforeDelayMs: 100, afterDelayMs: 260 },
        { action: "delay", delayMs: 850 },
        { action: "runCommand", value: "/pp dump", beforeDelayMs: 100, afterDelayMs: 260 },
        { action: "delay", delayMs: 1_000 },
        { action: "takeScreenshot", name: "showcase-stable", delayMs: 500, openChat: true },
        { action: "delay", delayMs: 450 }
      ]
    }
  ]
});
