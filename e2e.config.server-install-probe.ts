import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-server-install-probe",
  scenarios: [
    {
      id: "server-install-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "waitForFileContains", service: "paper-main", path: "plugins/PluginPortal/history.log", value: "LOAD_PLUGINS", timeoutMs: 30_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion/config.yml", timeoutMs: 60_000 },
        { action: "assertFileContains", service: "paper-main", path: "plugins/ViaVersion/config.yml", value: "check-for-updates: true" },
        { action: "runServerCommand", service: "paper-main", command: "pp update ViaVersion", console: true },
        { action: "waitForServiceLog", service: "paper-main", pattern: "No plugins found", timeoutMs: 60_000 },
        { action: "assertFileContains", service: "paper-main", path: "plugins/PluginPortal/history.log", value: "LOAD_PLUGINS" }
      ]
    }
  ]
});
