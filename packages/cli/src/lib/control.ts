import net from "node:net";

export interface ControlRequest {
  id: string;
  action: string;
  command?: string;
  address?: string;
  name?: string;
  text?: string;
  path?: string;
  timeoutMs?: number;
  delayMs?: number;
  visualize?: boolean;
  beforeDelayMs?: number;
  afterDelayMs?: number;
  openChat?: boolean;
  afterSequence?: number;
}

export interface ControlResponse {
  id?: string;
  ok: boolean;
  message: string;
  result?: Record<string, string>;
  payload?: string;
}

export async function sendControlRequest(host: string, port: number, request: ControlRequest): Promise<ControlResponse> {
  return await new Promise<ControlResponse>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = "";

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes("\n")) return;
      socket.end();
      resolve(JSON.parse(buffer.trim()) as ControlResponse);
    });

    socket.on("error", reject);
  });
}

export async function waitForClientReady(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await sendControlRequest(host, port, {
      id: `ping-${Date.now()}`,
      action: "ping"
    });

    if (
      response.ok &&
      response.result?.playerPresent === "true" &&
      response.result?.worldLoaded === "true"
    ) {
      return;
    }

    await Bun.sleep(1_000);
  }

  throw new Error("Timed out waiting for the Minecraft client to join the test server");
}

export async function ensureClientConnected(
  host: string,
  port: number,
  address: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastConnectAttempt = 0;
  let lastSeenScreen = "";

  while (Date.now() < deadline) {
    const response = await sendControlRequest(host, port, {
      id: `connect-ping-${Date.now()}`,
      action: "ping"
    });

    if (
      response.ok &&
      response.result?.playerPresent === "true" &&
      response.result?.worldLoaded === "true"
    ) {
      return;
    }

    const screenClass = response.result?.screenClass ?? "";
    const screenTitle = response.result?.screenTitle ?? "";
    const pendingConnection = response.result?.pendingConnection === "true";
    const now = Date.now();
    const isConnecting = screenClass.includes("ConnectScreen");
    const isDisconnected = screenClass.includes("DisconnectedScreen");
    const retryDelayMs = isDisconnected ? 4_000 : 2_500;
    const screenKey = `${screenClass}::${screenTitle}`;
    if (screenKey !== lastSeenScreen) {
      lastSeenScreen = screenKey;
    }
    const canReconnect = !isConnecting && !pendingConnection && now - lastConnectAttempt >= retryDelayMs;

    if (response.ok && canReconnect) {
      const connectResponse = await sendControlRequest(host, port, {
        id: `connect-${now}`,
        action: "connect",
        address
      });
      if (!connectResponse.ok) {
        throw new Error(connectResponse.message);
      }
      lastConnectAttempt = now;
    }

    await Bun.sleep(isConnecting || pendingConnection ? 500 : 1_000);
  }

  throw new Error(`Timed out waiting for the Minecraft client to join the test server (${lastSeenScreen || "no screen info"})`);
}

export async function waitForClientMenu(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await sendControlRequest(host, port, {
      id: `menu-${Date.now()}`,
      action: "ping"
    });

    if (response.ok && response.result?.screenClass) {
      return;
    }

    await Bun.sleep(1_000);
  }

  throw new Error("Timed out waiting for the Minecraft client to reach a menu screen");
}
