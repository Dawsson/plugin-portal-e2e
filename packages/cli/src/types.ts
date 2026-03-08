export type ServerFamily = "paper" | "purpur" | "pufferfish" | "spigot";
export type ProxyFamily = "velocity" | "waterfall" | "bungeecord";

export interface LocalBuildReleaseSource {
  mode: "local-build";
  pluginRepoPath: string;
}

export interface LocalPathReleaseSource {
  mode: "local-path";
  path: string;
}

export interface UrlReleaseSource {
  mode: "url";
  url: string;
}

export interface ApiLocalReleaseSource {
  mode: "api-local";
}

export interface ApiProductionReleaseSource {
  mode: "api-production";
}

export type ReleaseSource =
  | LocalBuildReleaseSource
  | LocalPathReleaseSource
  | UrlReleaseSource
  | ApiLocalReleaseSource
  | ApiProductionReleaseSource;

export interface ApiTarget {
  mode: "local" | "production" | "custom";
  baseUrl: string;
}

export interface ClientConfig {
  minecraftVersion: string;
  prism: {
    appPath: string;
    instanceName: string;
  };
}

export interface ServerNode {
  id: string;
  family: ServerFamily | ProxyFamily;
  version: string;
}

export interface ScenarioStep {
  action: "runCommand" | "waitForChat" | "takeScreenshot" | "clickChat";
  value?: string;
  name?: string;
  text?: string;
  timeoutMs?: number;
}

export interface Scenario {
  id: string;
  kind: "scripted";
  steps: ScenarioStep[];
}

export interface E2EConfig {
  projectName: string;
  artifactsDir: string;
  apiTarget: ApiTarget;
  releaseSource: ReleaseSource;
  client: ClientConfig;
  topology: {
    preset: "single-paper" | "paper-family" | "proxy-velocity" | "proxy-waterfall" | "proxy-bungeecord" | "full";
    servers: ServerNode[];
  };
  watch: {
    include: string[];
    exclude: string[];
  };
  scenarios: Scenario[];
}

export interface LocalState {
  prismAppPath?: string;
  prismInstanceRoot?: string;
  obsAppPath?: string;
  obsSceneCollection?: string;
}
