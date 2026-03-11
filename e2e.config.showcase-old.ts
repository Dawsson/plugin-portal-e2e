import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionOldUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-showcase-old",
  watch: {
    include: ["plugins/*.jar", "plugins/ViaVersion/**", "plugins/PluginPortal/**"],
    exclude: ["**/*.tmp"]
  },
  scenarios: [
    {
      id: "showcase-old",
      kind: "scripted",
      steps: [
        { action: "runCommand", value: "/pp", beforeDelayMs: 100, afterDelayMs: 220 },
        { action: "delay", delayMs: 350 },
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionOldUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "connectClient", timeoutMs: 180_000 },
        { action: "delay", delayMs: 700 },
        { action: "runCommand", value: "/plugins", beforeDelayMs: 100, afterDelayMs: 240 },
        { action: "delay", delayMs: 1_000 },
        { action: "takeScreenshot", name: "showcase-old", delayMs: 500, openChat: true },
        { action: "delay", delayMs: 450 }
      ]
    }
  ]
});
