import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionOldUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-old-jar-command-probe",
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 560
  },
  scenarios: [
    {
      id: "old-jar-command-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionOldUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.3.1.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion/config.yml", timeoutMs: 60_000 },
        { action: "delay", delayMs: 5_000 },
        { action: "runServerCommand", service: "paper-main", command: "pp scan ViaVersion-5.3.1.jar" },
        { action: "assertOutputContains", value: "ViaVersion" },
        { action: "runServerCommand", service: "paper-main", command: "pp recognize ViaVersion-5.3.1.jar" },
        { action: "assertOutputContains", value: "ViaVersion" },
        { action: "runServerCommand", service: "paper-main", command: "pp dump" },
        { action: "assertOutputContains", value: "mclo.gs" }
      ]
    }
  ]
});
