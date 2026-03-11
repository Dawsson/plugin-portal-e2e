import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionSnapshotUrl =
  "https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.7.3-SNAPSHOT%2B927/PAPER/ViaVersion-5.7.3-SNAPSHOT.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-showcase-snapshot",
  watch: {
    include: ["plugins/*.jar", "plugins/ViaVersion/**", "plugins/PluginPortal/**"],
    exclude: ["**/*.tmp"]
  },
  scenarios: [
    {
      id: "showcase-snapshot",
      kind: "scripted",
      steps: [
        { action: "runCommand", value: "/pp view ViaVersion HANGAR --byId", beforeDelayMs: 100, afterDelayMs: 320 },
        { action: "delay", delayMs: 850 },
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionSnapshotUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.7.3-SNAPSHOT.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "connectClient", timeoutMs: 180_000 },
        { action: "delay", delayMs: 700 },
        { action: "runCommand", value: "/plugins", beforeDelayMs: 100, afterDelayMs: 240 },
        { action: "delay", delayMs: 1_000 },
        { action: "takeScreenshot", name: "showcase-snapshot", delayMs: 500, openChat: true },
        { action: "delay", delayMs: 450 }
      ]
    }
  ]
});
