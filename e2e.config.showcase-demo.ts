import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionSnapshotUrl = "https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.7.3-SNAPSHOT%2B927/PAPER/ViaVersion-5.7.3-SNAPSHOT.jar";
const viaVersionOldUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-showcase-demo",
  watch: {
    include: [
      "plugins/*.jar",
      "plugins/ViaVersion/**",
      "plugins/PluginPortal/**"
    ],
    exclude: [
      "**/*.tmp"
    ]
  },
  scenarios: [
    {
      id: "showcase-demo",
      kind: "scripted",
      steps: [
        { action: "runCommand", value: "/pp", beforeDelayMs: 120, afterDelayMs: 260 },
        { action: "delay", delayMs: 700 },

        { action: "runCommand", value: "/pp info", beforeDelayMs: 120, afterDelayMs: 300 },
        { action: "delay", delayMs: 900 },

        { action: "runCommand", value: "/pp view ViaVersion HANGAR --byId", beforeDelayMs: 120, afterDelayMs: 420 },
        { action: "delay", delayMs: 1_800 },

        { action: "runServerCommand", service: "paper-main", command: "pp install P1OZGk5p MODRINTH --byId", console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/*ViaVersion*.jar", timeoutMs: 60_000 },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 },
        { action: "delay", delayMs: 1_000 },

        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "connectClient", timeoutMs: 180_000 },
        { action: "delay", delayMs: 1_000 },

        { action: "runCommand", value: "/pp list", beforeDelayMs: 120, afterDelayMs: 320 },
        { action: "delay", delayMs: 1_400 },

        { action: "runCommand", value: "/pp dump", beforeDelayMs: 120, afterDelayMs: 320 },
        { action: "delay", delayMs: 1_200 },

        { action: "runServerCommand", service: "paper-main", command: "pp uninstall ViaVersion", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 },
        { action: "delay", delayMs: 800 },

        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionSnapshotUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.7.3-SNAPSHOT.jar", timeoutMs: 60_000 },
        { action: "delay", delayMs: 1_000 },

        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "connectClient", timeoutMs: 180_000 },
        { action: "delay", delayMs: 1_000 },

        { action: "runCommand", value: "/plugins", beforeDelayMs: 120, afterDelayMs: 260 },
        { action: "delay", delayMs: 1_000 },

        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionOldUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "delay", delayMs: 1_000 },

        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "connectClient", timeoutMs: 180_000 },
        { action: "delay", delayMs: 1_000 },

        { action: "runCommand", value: "/plugins", beforeDelayMs: 120, afterDelayMs: 260 },
        { action: "delay", delayMs: 1_000 },

        { action: "takeScreenshot", name: "showcase-demo-final", delayMs: 800, openChat: true },
        { action: "delay", delayMs: 800 }
      ]
    }
  ]
});
