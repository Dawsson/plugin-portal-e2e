import { sendControlRequest } from "../lib/control.ts";

export async function inspectChat(): Promise<void> {
  const response = await sendControlRequest("127.0.0.1", 44712, {
    id: `inspect-chat-${Date.now()}`,
    action: "inspectChat"
  });

  if (!response.ok) {
    throw new Error(response.message);
  }

  const payload = response.payload ? JSON.parse(response.payload) : {};
  console.log(JSON.stringify(payload, null, 2));
}
