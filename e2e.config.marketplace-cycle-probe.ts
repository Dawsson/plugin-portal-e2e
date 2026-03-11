import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-marketplace-cycle-probe",
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 560
  },
  scenarios: [
    {
      id: "marketplace-cycle-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: "pp install P1OZGk5p MODRINTH --byId", console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/*ViaVersion*.jar", timeoutMs: 60_000 },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion/config.yml", timeoutMs: 60_000 },
        { action: "runServerCommand", service: "paper-main", command: "pp list" },
        { action: "assertOutputContains", value: "ViaVersion" },
        { action: "runServerCommand", service: "paper-main", command: "pp uninstall ViaVersion", console: true },
        { action: "waitForFileChange", service: "paper-main", pattern: "plugins/PluginPortal/plugins.json", timeoutMs: 60_000 }
      ]
    }
  ]
});
