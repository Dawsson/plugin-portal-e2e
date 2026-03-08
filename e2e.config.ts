import { defineConfig } from "./packages/cli/src/config.ts";

const config = defineConfig({
  projectName: "plugin-portal-e2e",
  artifactsDir: "artifacts",
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
      appPath: "/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher",
      instanceName: "plugin-portal-e2e-1.21.4"
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
          value: "/pp help"
        },
        {
          action: "takeScreenshot",
          name: "help-screen"
        }
      ]
    },
    {
      id: "list",
      kind: "scripted",
      steps: [
        {
          action: "runCommand",
          value: "/pp list"
        },
        {
          action: "takeScreenshot",
          name: "list-screen"
        }
      ]
    }
  ]
});

export default config;
