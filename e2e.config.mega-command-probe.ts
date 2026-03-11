import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionOldUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";
const pluginsIndexPath = "plugins/PluginPortal/plugins.json";
const historyLogPath = "plugins/PluginPortal/history.log";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-mega-command-probe",
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 560,
  },
  scenarios: [
    {
      id: "baseline-and-view-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: "plugins" },
        { action: "delay", delayMs: 500 },

        { action: "runServerCommand", service: "paper-main", command: "pp" },
        { action: "delay", delayMs: 500 },

        { action: "runServerCommand", service: "paper-main", command: "pp version" },
        { action: "waitForServiceLog", service: "paper-main", pattern: "check-update\\?current=3\\.7\\.06", timeoutMs: 30_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp info" },
        { action: "delay", delayMs: 500 },

        { action: "runServerCommand", service: "paper-main", command: "pp list" },
        { action: "delay", delayMs: 500 },

        { action: "runServerCommand", service: "paper-main", command: "pp view ViaVersion HANGAR --byId" },
        { action: "delay", delayMs: 1_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp view ViaVersion HANGAR --byId --exact" },
        { action: "delay", delayMs: 1_000 },
      ],
    },
    {
      id: "outdated-install-update-cycle",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionOldUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "waitForFileChange", service: "paper-main", pattern: pluginsIndexPath, timeoutMs: 30_000 },
        { action: "waitForFileContains", service: "paper-main", path: historyLogPath, value: "LOAD_PLUGINS", timeoutMs: 30_000 },

        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion/config.yml", timeoutMs: 60_000 },
        { action: "assertFileContains", service: "paper-main", path: "plugins/ViaVersion/config.yml", value: "check-for-updates: true" },

        { action: "runServerCommand", service: "paper-main", command: "pp list" },
        { action: "delay", delayMs: 500 },

        { action: "runServerCommand", service: "paper-main", command: "pp scan plugins/ViaVersion-5.3.1.jar" },
        { action: "delay", delayMs: 1_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp recognize plugins/ViaVersion-5.3.1.jar" },
        { action: "delay", delayMs: 1_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp recognizeAll" },
        { action: "delay", delayMs: 2_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp dump" },
        { action: "delay", delayMs: 1_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp update ViaVersion", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: pluginsIndexPath, timeoutMs: 60_000 },
        { action: "waitForFileContains", service: "paper-main", path: historyLogPath, value: "LOAD_PLUGINS", timeoutMs: 30_000 },

        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion/config.yml", timeoutMs: 60_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp updateAll", console: true },
        { action: "delay", delayMs: 1_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp uninstall ViaVersion", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: pluginsIndexPath, timeoutMs: 60_000 },
        { action: "waitForFileContains", service: "paper-main", path: historyLogPath, value: "DELETE_PLUGIN", timeoutMs: 30_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp list" },
        { action: "delay", delayMs: 500 },

        { action: "runServerCommand", service: "paper-main", command: "pp install ViaVersion HANGAR --byId", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: pluginsIndexPath, timeoutMs: 60_000 },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion*.jar", timeoutMs: 60_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp list" },
        { action: "delay", delayMs: 500 },
      ],
    },
  ],
});
