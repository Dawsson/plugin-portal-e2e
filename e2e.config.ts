import { defineConfig } from "./packages/cli/src/config.ts";

const config = defineConfig({
  projectName: "plugin-portal-e2e",
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
      instanceName: process.env.PP_E2E_PRISM_INSTANCE_NAME ?? "plugin-portal-e2e-1.21.4",
      profile: process.env.PP_E2E_PRISM_PROFILE ?? "Dawsson"
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
    enabled: true,
    provider: "native",
    composeRightPanel: true,
    panelWidth: 560
  },
  topology: {
    preset: "single-paper",
    servers: [
      {
        id: "paper-main",
        family: "paper",
        version: "1.21.4"
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
      id: "demo",
      kind: "scripted",
      steps: [
        {
          action: "runCommand",
          value: "/pp list"
        },
        {
          action: "delay",
          delayMs: 2200
        },
        {
          action: "runCommand",
          value: "/pp install ViaVersion HANGAR --byId"
        },
        {
          action: "delay",
          delayMs: 2600
        },
        {
          action: "runCommand",
          value: "/pp list"
        },
        {
          action: "delay",
          delayMs: 2600
        },
        {
          action: "takeScreenshot",
          name: "pp-install-demo-screen",
          delayMs: 1500,
          openChat: true
        }
      ]
    }
  ]
});

export default config;
