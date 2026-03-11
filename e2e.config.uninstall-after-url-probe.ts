import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionOldUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-uninstall-after-url-probe",
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 560
  },
  scenarios: [
    {
      id: "uninstall-after-url-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionOldUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForServiceLog", service: "paper-main", pattern: "Loading server plugin ViaVersion v5\\.3\\.1", timeoutMs: 60_000 },
        { action: "runServerCommand", service: "paper-main", command: "pp uninstall ViaVersion", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 }
      ]
    }
  ]
});
