import {
  backendNode,
  createProxyTopology,
  defineConfig,
  proxyNode
} from "./packages/cli/src/config";

const backends = [
  backendNode("paper-lobby", "paper", "1.21.4"),
  backendNode("paper-admin", "paper", "1.21.4")
];

export default defineConfig({
  projectName: "plugin-portal-proxy-two-paper",
  artifactsDir: "artifacts",
  apiTarget: {
    mode: "production",
    baseUrl: process.env.PP_E2E_API_LOCAL_URL ?? "https://api.dawson.gg"
  },
  releaseSource: {
    mode: "url",
    url: process.env.PP_E2E_PLUGIN_URL ??
      "https://cdn.modrinth.com/data/5qkQnnWO/versions/3IXITO7f/PluginPortal-3.7.06.jar"
  },
  client: {
    minecraftVersion: "1.21.4",
    prism: {
      appPath: process.env.PP_E2E_PRISM_APP_PATH ?? "/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher",
      instanceName: "plugin-portal-e2e-1.21.4",
      profile: "Dawsson"
    }
  },
  cleanup: {
    closeClient: true,
    stopContainers: true,
    wipeVolumes: false
  },
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 480
  },
  topology: createProxyTopology({
    backends,
    proxy: proxyNode("velocity-main", "velocity", "latest", backends.map((server) => server.id))
  }),
  watch: {
    include: ["plugins/*.jar", "plugins/PluginPortal/**"],
    exclude: ["**/*.tmp"]
  },
  scenarios: [
    {
      id: "backend-plugins",
      kind: "scripted",
      steps: [
        { action: "waitForServiceLog", service: "velocity-main", pattern: "Listening on", timeoutMs: 60_000 },
        { action: "runServerCommand", service: "paper-lobby", command: "plugins" },
        { action: "assertOutputContains", value: "PluginPortal" },
        { action: "delay", delayMs: 500 },
        { action: "runServerCommand", service: "paper-admin", command: "plugins" },
        { action: "assertOutputContains", value: "PluginPortal" }
      ]
    }
  ]
});
