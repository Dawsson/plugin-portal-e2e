import { defineConfig } from "./packages/cli/src/config.ts";

const viaVersionUrl = "https://cdn.modrinth.com/data/P1OZGk5p/versions/ZbFOsGG3/ViaVersion-5.3.1.jar";

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
    panelWidth: 480
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
          value: "/ppm"
        },
        {
          action: "delay",
          delayMs: 1800
        },
        {
          action: "runCommand",
          value: "/ppm version"
        },
        {
          action: "delay",
          delayMs: 1800
        },
        {
          action: "runCommand",
          value: "/ppm list"
        },
        {
          action: "delay",
          delayMs: 2000
        },
        {
          action: "runServerCommand",
          service: "paper-main",
          command: `pp install-url ${viaVersionUrl}`,
          console: true
        },
        {
          action: "waitForFile",
          service: "paper-main",
          pattern: "plugins/ViaVersion-5.3.1.jar",
          timeoutMs: 60_000
        },
        {
          action: "delay",
          delayMs: 2500
        },
        {
          action: "takeScreenshot",
          name: "ppm-demo-screen",
          delayMs: 1500,
          openChat: true
        }
      ]
    }
  ]
});

export default config;
