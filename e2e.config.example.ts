import { defineConfig } from "./packages/cli/src/config";

export default defineConfig({
  projectName: "plugin-portal-local",
  artifactsDir: "./artifacts",
  apiTarget: {
    mode: "local",
    baseUrl: "http://localhost:3001"
  },
  releaseSource: {
    mode: "url",
    url: "https://cdn.modrinth.com/data/5qkQnnWO/versions/3IXITO7f/PluginPortal-3.7.06.jar"
  },
  client: {
    minecraftVersion: "1.21.4",
    prism: {
      appPath: "/Applications/Prism Launcher.app",
      instanceName: "plugin-portal-e2e-1.21.4"
    },
    macos: {
      launchMode: "background"
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
  topology: {
    preset: "single-paper",
    exposeHostPorts: true,
    servers: [
      {
        id: "paper-main",
        family: "paper",
        version: "1.21.4"
      },
      {
        id: "proxy-main",
        family: "velocity",
        version: "latest",
        backends: ["paper-main"],
        forwardingMode: "legacy"
      }
    ]
  },
  watch: {
    include: [
      "plugins/*.jar",
      "plugins/PluginPortal/**"
    ],
    exclude: [
      "**/*.tmp"
    ]
  },
  scenarios: [
    {
      id: "help",
      kind: "scripted",
      steps: [
        {
          action: "runCommand",
          value: "/pp"
        },
        {
          action: "takeScreenshot",
          name: "help"
        }
      ]
    }
  ]
});
