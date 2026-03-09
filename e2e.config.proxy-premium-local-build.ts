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
  projectName: "plugin-portal-proxy-premium-local-build",
  artifactsDir: "artifacts",
  apiTarget: {
    mode: "production",
    baseUrl: "https://v4.pluginportal.link",
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
      profile: "Dawsson",
    },
    macos: {
      launchMode: "background",
    },
  },
  cleanup: {
    closeClient: true,
    stopContainers: true,
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
    exposeHostPorts: false,
  },
  watch: {
    include: ["plugins/*.jar", "plugins/PluginPortal/**"],
    exclude: ["**/*.tmp"],
  },
  scenarios: [
    {
      id: "proxy-startup",
      kind: "scripted",
      steps: [
        { action: "waitForServiceLog", service: "velocity-main", pattern: "PluginPortal", timeoutMs: 60_000 },
        { action: "runServerCommand", service: "velocity-main", command: "plugins", console: true },
        { action: "assertOutputContains", value: "PluginPortal" },
        { action: "runServerCommand", service: "paper-lobby", command: "plugins" },
        { action: "assertOutputContains", value: "PluginPortal" },
        { action: "runServerCommand", service: "paper-admin", command: "plugins" },
        { action: "assertOutputContains", value: "PluginPortal" },
        { action: "runServerCommand", service: "velocity-main", command: "pp nodes", console: true },
        { action: "assertOutputContains", value: "paper-lobby" },
        { action: "runServerCommand", service: "velocity-main", command: "pp list --server paper-lobby", console: true },
        { action: "assertOutputContains", value: "PluginPortal" },
      ],
    },
  ],
});
