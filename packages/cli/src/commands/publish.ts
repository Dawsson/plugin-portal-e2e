import { existsSync } from "node:fs";
import { resolve } from "node:path";

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function findLatestVideo(root: string): Promise<string> {
  const matches: Array<{ path: string; mtimeMs: number }> = [];
  const glob = new Bun.Glob("artifacts/*/video/composited.mp4");
  for await (const relPath of glob.scan({ cwd: root, absolute: false })) {
    const absPath = resolve(root, relPath);
    const stat = await Bun.file(absPath).stat();
    matches.push({ path: absPath, mtimeMs: stat.mtimeMs });
  }

  const latest = matches.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!latest) {
    throw new Error("No composited.mp4 artifact was found under artifacts/");
  }
  return latest.path;
}

async function uploadToCdn(filePath: string): Promise<string> {
  const token = process.env.PP_E2E_CDN_ACCESS_TOKEN;
  if (!token) {
    throw new Error("PP_E2E_CDN_ACCESS_TOKEN is not set");
  }

  if (!existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const file = Bun.file(filePath);
  const form = new FormData();
  form.set("image", new Blob([await file.arrayBuffer()], { type: file.type || "video/mp4" }), file.name);

  const response = await fetch("https://api.cdn.wip.group/upload", {
    method: "POST",
    headers: {
      "Access-Token": token
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`CDN upload failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as {
    success?: boolean;
    url?: string;
    name?: string;
  };

  if (!payload.success || !payload.url) {
    throw new Error(`CDN upload did not return a usable url: ${JSON.stringify(payload)}`);
  }

  return payload.url;
}

async function postToDiscord(url: string, sourceFile: string): Promise<void> {
  const webhookUrl = process.env.PP_E2E_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("PP_E2E_DISCORD_WEBHOOK_URL is not set");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: [
        "Plugin Portal E2E demo uploaded",
        url,
        `source: ${sourceFile}`
      ].join("\n")
    })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with ${response.status}: ${await response.text()}`);
  }
}

export async function publishLatest(root: string, args: string[]): Promise<void> {
  const explicitFile = readFlag(args, "--file");
  const filePath = explicitFile ? resolve(root, explicitFile) : await findLatestVideo(root);
  const url = await uploadToCdn(filePath);
  await postToDiscord(url, filePath);

  console.log([
    "Published demo artifact",
    `File: ${filePath}`,
    `CDN: ${url}`
  ].join("\n"));
}
