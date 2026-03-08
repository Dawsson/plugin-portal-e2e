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
    }
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
      id: "help",
      kind: "scripted",
      steps: [
        {
          action: "runCommand",
          value: "/ppm"
        },
        {
          action: "takeScreenshot",
          name: "ppm-help-screen"
        }
      ]
    }
  ]
});

export default config;
