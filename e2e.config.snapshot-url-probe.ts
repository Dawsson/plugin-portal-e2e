import base from "./e2e.config.ts";
import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionSnapshotUrl = "https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.7.3-SNAPSHOT%2B927/PAPER/ViaVersion-5.7.3-SNAPSHOT.jar";

export default defineConfig({
  ...base,
  projectName: "plugin-portal-snapshot-url-probe",
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 560
  },
  scenarios: [
    {
      id: "snapshot-url-probe",
      kind: "scripted",
      steps: [
        { action: "runServerCommand", service: "paper-main", command: `pp install-url ${viaVersionSnapshotUrl}`, console: true },
        { action: "waitForFile", service: "paper-main", pattern: "plugins/ViaVersion-5.7.3-SNAPSHOT.jar", timeoutMs: 60_000 },
        { action: "restartService", service: "paper-main", timeoutMs: 180_000 },
        { action: "waitForServiceLog", service: "paper-main", pattern: "ViaVersion v5\\.7\\.3-SNAPSHOT", timeoutMs: 60_000 }
      ]
    }
  ]
});
