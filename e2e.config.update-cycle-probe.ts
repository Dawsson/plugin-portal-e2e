import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionStableId = "P1OZGk5p";
const viaVersionOldUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";
const viaVersionSnapshotUrl =
  "https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.7.3-SNAPSHOT%2B927/PAPER/ViaVersion-5.7.3-SNAPSHOT.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-update-cycle-probe",
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 560
  },
  scenarios: [
    {
      id: "update-cycle-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: `pp install ${viaVersionStableId} MODRINTH --byId`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/*ViaVersion*.jar", timeoutMs: 60_000 },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForServiceLog", service: "paper-main", pattern: "Loading server plugin ViaVersion v5\\.7\\.2", timeoutMs: 60_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp uninstall ViaVersion", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 },

        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionOldUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        {
          action: "waitForServiceLog",
          service: "paper-main",
          pattern: "There is a newer plugin version available: 5\\.7\\.2, you're on: 5\\.3\\.1",
          timeoutMs: 60_000
        },

        { action: "runServerCommand", service: "paper-main", command: "pp update ViaVersion", console: true },
        { action: "waitForServiceLog", service: "paper-main", pattern: "Starting installation of ViaVersion", timeoutMs: 60_000 },
        { action: "waitForServiceLog", service: "paper-main", pattern: "Downloaded ViaVersion from MODRINTH", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForServiceLog", service: "paper-main", pattern: "Loading server plugin ViaVersion v5\\.7\\.2", timeoutMs: 60_000 },

        { action: "runServerCommand", service: "paper-main", command: "pp dump" },
        { action: "assertOutputContains", value: "mclo.gs" },

        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionSnapshotUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.7.3-SNAPSHOT.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForServiceLog", service: "paper-main", pattern: "Loading server plugin ViaVersion v5\\.7\\.3-SNAPSHOT", timeoutMs: 60_000 }
      ]
    }
  ]
});
