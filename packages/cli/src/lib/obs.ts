import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand, runDetached } from "./exec.ts";
import { waitForPort } from "./wait.ts";

type ObsHello = {
  op: number;
  d?: {
    authentication?: {
      challenge: string;
      salt: string;
    };
    rpcVersion?: number;
  };
};

type ObsResponse = {
  op: number;
  d?: {
    requestId?: string;
    requestStatus?: {
      code: number;
      result: boolean;
      comment?: string;
    };
    responseData?: Record<string, unknown>;
  };
};

function sha256Base64(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

function obsConfigPath(): string {
  return join(
    process.env.HOME ?? "",
    "Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json"
  );
}

export function ensureObsWebSocketEnabled(port = 4455): void {
  const path = obsConfigPath();
  if (!existsSync(path)) {
    return;
  }
  const config = JSON.parse(readFileSync(path, "utf8")) as {
    alerts_enabled?: boolean;
    auth_required?: boolean;
    first_load?: boolean;
    server_enabled?: boolean;
    server_password?: string;
    server_port?: number;
  };
  config.server_enabled = true;
  config.auth_required = false;
  config.server_port = config.server_port ?? port;
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function launchObs(appPath = "/Applications/OBS.app/Contents/MacOS/OBS"): number {
  if (appPath.endsWith(".app")) {
    return runDetached(["open", "-na", appPath]);
  }
  return runDetached([appPath]);
}

export function closeObs(): void {
  runCommand(["osascript", "-e", 'tell application "OBS" to quit']);
  runCommand(["pkill", "-f", "/Applications/OBS.app/Contents/MacOS/OBS|obs-studio"]);
}

export class ObsClient {
  private socket: WebSocket | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<string, { resolve: (value: ObsResponse) => void; reject: (error: Error) => void }>();

  async connect(port: number, password?: string): Promise<void> {
    await waitForPort("127.0.0.1", port, 30_000);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket = socket;

    const waitForOp = <T extends { op: number }>(op: number, timeoutMs: number, message: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.removeEventListener("message", listener);
          reject(new Error(message));
        }, timeoutMs);
        const listener = (event: MessageEvent) => {
          const payload = JSON.parse(String(event.data)) as T;
          if (payload.op !== op) {
            return;
          }
          clearTimeout(timeout);
          socket.removeEventListener("message", listener);
          resolve(payload);
        };
        socket.addEventListener("message", listener);
      });

    const hello = await waitForOp<ObsHello>(0, 10_000, "Timed out waiting for OBS hello");

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data)) as ObsResponse;
      if (payload.op !== 7 || !payload.d?.requestId) {
        return;
      }
      const pending = this.pending.get(payload.d.requestId);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.d.requestId);
      pending.resolve(payload);
    });

    const auth = hello.d?.authentication
      ? sha256Base64(`${sha256Base64(`${password ?? ""}${hello.d.authentication.salt}`)}${hello.d.authentication.challenge}`)
      : undefined;

    const identified = waitForOp<ObsResponse>(2, 10_000, "Timed out waiting for OBS identify response");
    socket.send(JSON.stringify({
      op: 1,
      d: {
        rpcVersion: hello.d?.rpcVersion ?? 1,
        authentication: auth
      }
    }));
    await identified;
  }

  async request<T extends Record<string, unknown> = Record<string, unknown>>(
    requestType: string,
    requestData: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.socket) {
      throw new Error("OBS websocket is not connected");
    }

    const requestId = `req-${this.nextRequestId++}`;
    const response = await new Promise<ObsResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.socket?.send(JSON.stringify({
        op: 6,
        d: {
          requestId,
          requestType,
          requestData
        }
      }));
      setTimeout(() => {
        if (!this.pending.has(requestId)) {
          return;
        }
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for OBS ${requestType}`));
      }, 10_000);
    });

    if (!response.d?.requestStatus?.result) {
      throw new Error(`OBS ${requestType} failed: ${response.d?.requestStatus?.comment ?? "unknown error"}`);
    }

    return (response.d?.responseData ?? {}) as T;
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }
}
