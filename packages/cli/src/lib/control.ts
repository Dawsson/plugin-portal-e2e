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
  openChat?: boolean;
}

export interface ControlResponse {
  id?: string;
  ok: boolean;
  message: string;
  result?: Record<string, string>;
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
