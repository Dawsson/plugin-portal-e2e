export type ServerFamily = "paper" | "purpur" | "pufferfish" | "spigot";
export type ProxyFamily = "velocity" | "waterfall" | "bungeecord";

export interface LocalBuildReleaseSource {
  mode: "local-build";
  pluginRepoPath: string;
  variant?: "free" | "premium";
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
    profile?: string;
  };
}

export interface CleanupConfig {
  closeClient: boolean;
  stopContainers: boolean;
  wipeVolumes: boolean;
}

export interface RecordingConfig {
  enabled: boolean;
  provider: "obs" | "ffmpeg" | "none";
  composeRightPanel: boolean;
  panelWidth: number;
}

export interface ServerNode {
  id: string;
  family: ServerFamily | ProxyFamily;
  version: string;
  backends?: string[];
  forwardingMode?: "modern" | "legacy";
}

export interface ScenarioStep {
  action:
    | "runCommand"
    | "waitForChat"
    | "takeScreenshot"
    | "clickChat"
    | "delay"
    | "runServerCommand"
    | "assertOutputContains"
    | "waitForServiceLog"
    | "waitForFile"
    | "assertFileExists";
  value?: string;
  name?: string;
  text?: string;
  timeoutMs?: number;
  delayMs?: number;
  openChat?: boolean;
  service?: string;
  command?: string;
  pattern?: string;
  path?: string;
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
  cleanup: CleanupConfig;
  recording: RecordingConfig;
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
  obsWebSocketPort?: number;
  obsWebSocketPassword?: string;
}
