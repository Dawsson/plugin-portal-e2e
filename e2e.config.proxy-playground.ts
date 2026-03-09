import {
  backendNode,
  createProxyTopology,
  defineConfig,
  proxyNode,
} from "./packages/cli/src/config";

const backends = [
  backendNode("paper-lobby", "paper", "1.21.4"),
  backendNode("paper-admin", "paper", "1.21.4"),
];

export default defineConfig({
  projectName: "plugin-portal-proxy-playground",
  artifactsDir: "artifacts",
  apiTarget: {
    mode: "local",
    baseUrl: process.env.PP_E2E_API_LOCAL_URL ?? "http://host.docker.internal:3001",
  },
  releaseSource: {
    mode: "local-build",
    pluginRepoPath: "../plugin",
    variant: "premium",
  },
  client: {
    minecraftVersion: "1.21.4",
    prism: {
      appPath: process.env.PP_E2E_PRISM_APP_PATH ?? "/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher",
      instanceName: "plugin-portal-e2e-1.21.4",
      profile: "dawsson",
    },
    macos: {
      launchMode: "foreground",
    },
  },
  cleanup: {
    closeClient: false,
    stopContainers: false,
    wipeVolumes: false,
  },
  recording: {
    enabled: false,
    provider: "none",
    composeRightPanel: true,
    panelWidth: 480,
  },
  topology: {
    ...createProxyTopology({
      backends,
      proxy: proxyNode("velocity-main", "velocity", "latest", backends.map((server) => server.id)),
    }),
    exposeHostPorts: true,
    hostPort: 25566,
  },
  watch: {
    include: ["plugins/*.jar", "plugins/PluginPortal/**"],
    exclude: ["**/*.tmp"],
  },
  scenarios: [
    {
      id: "proxy-playground-startup",
      kind: "scripted",
      steps: [
        { action: "waitForServiceLog", service: "velocity-main", pattern: "PluginPortal", timeoutMs: 60_000 },
        { action: "runServerCommand", service: "paper-lobby", command: "plugins" },
        { action: "assertOutputContains", value: "PluginPortal" },
        { action: "runServerCommand", service: "paper-admin", command: "plugins" },
        { action: "assertOutputContains", value: "PluginPortal" },
        { action: "delay", delayMs: 3000 },
      ],
    },
  ],
});
