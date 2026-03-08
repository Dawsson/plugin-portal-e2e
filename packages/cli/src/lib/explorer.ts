import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";

type TimelineEntry = Record<string, unknown> & {
  type: string;
  tMs?: number;
};

type FileRow = {
  scope: string;
  path: string;
  status: "added" | "changed";
  size?: number;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderExplorerSnapshot(artifacts: ArtifactPaths): string {
  const timelinePath = join(artifacts.data, "timeline.jsonl");
  const entries = readFileSync(timelinePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TimelineEntry);

  const files = new Map<string, FileRow>();
  const recent: string[] = [];
  const services = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "watch.fs") {
      const scope = String(entry.scope);
      const path = String(entry.path);
      const key = `${scope}/${path}`;
      services.add(scope);
      if (entry.op === "remove") {
        files.delete(key);
      } else {
        files.set(key, {
          scope,
          path,
          status: entry.op === "add" ? "added" : "changed",
          size: typeof entry.size === "number" ? entry.size : undefined
        });
      }
    }

    if (entry.type === "scenario.step.finished" || entry.type === "artifact.screenshot" || entry.type === "run.finished") {
      const label = [
        entry.type === "artifact.screenshot" ? "Screenshot" : String(entry.action ?? entry.type),
        entry.command ? ` ${String(entry.command)}` : "",
        entry.path ? ` ${basename(String(entry.path))}` : ""
      ].join("").trim();
      recent.push(label);
    }
  }

  const width = 1280;
  const height = 760;
  const sidebarWidth = 220;
  const centerWidth = 680;
  const rightWidth = width - sidebarWidth - centerWidth;
  const lines = [...files.values()].slice(-11);
  const rightLines = recent.slice(-12);
  const serviceList = [...services].slice(-8);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#e9edf3"/>`,
    `<rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="22" fill="#f6f7fb" stroke="#cfd6e4"/>`,
    `<rect x="16" y="16" width="${sidebarWidth}" height="${height - 32}" rx="22" fill="#e8edf5"/>`,
    `<rect x="${sidebarWidth + 28}" y="28" width="${centerWidth - 24}" height="${height - 56}" rx="16" fill="#ffffff" stroke="#d7deea"/>`,
    `<rect x="${sidebarWidth + centerWidth + 20}" y="28" width="${rightWidth - 36}" height="${height - 56}" rx="16" fill="#111827"/>`,
    `<circle cx="42" cy="42" r="6" fill="#ff5f57"/>`,
    `<circle cx="62" cy="42" r="6" fill="#febc2e"/>`,
    `<circle cx="82" cy="42" r="6" fill="#28c840"/>`,
    `<text x="36" y="86" font-family="SF Pro Display, Helvetica, Arial" font-size="13" font-weight="600" fill="#516072">LOCATIONS</text>`,
    `<text x="${sidebarWidth + 52}" y="64" font-family="SF Pro Display, Helvetica, Arial" font-size="26" font-weight="700" fill="#1f2937">Runtime Files</text>`,
    `<text x="${sidebarWidth + centerWidth + 44}" y="64" font-family="SF Pro Display, Helvetica, Arial" font-size="26" font-weight="700" fill="#f9fafb">Activity</text>`,
    `<text x="${sidebarWidth + 52}" y="92" font-family="SF Pro Text, Helvetica, Arial" font-size="14" fill="#6b7280">Tracked changes for this run</text>`
  ];

  serviceList.forEach((service, index) => {
    svg.push(
      `<rect x="28" y="${102 + index * 42}" width="${sidebarWidth - 24}" height="32" rx="10" fill="#f8fafc" stroke="#d5ddea"/>`,
      `<text x="42" y="${123 + index * 42}" font-family="SF Pro Text, Helvetica, Arial" font-size="16" fill="#243244">${escapeXml(service)}</text>`
    );
  });

  svg.push(
    `<rect x="${sidebarWidth + 44}" y="110" width="${centerWidth - 48}" height="36" rx="10" fill="#f9fafb" stroke="#e5e7eb"/>`,
    `<text x="${sidebarWidth + 62}" y="133" font-family="SF Pro Text, Helvetica, Arial" font-size="14" font-weight="600" fill="#6b7280">Name</text>`,
    `<text x="${sidebarWidth + 420}" y="133" font-family="SF Pro Text, Helvetica, Arial" font-size="14" font-weight="600" fill="#6b7280">Service</text>`,
    `<text x="${sidebarWidth + 560}" y="133" font-family="SF Pro Text, Helvetica, Arial" font-size="14" font-weight="600" fill="#6b7280">Size</text>`
  );

  lines.forEach((line, index) => {
    const y = 158 + index * 46;
    const statusFill = line.status === "added" ? "#dcfce7" : "#dbeafe";
    const statusText = line.status === "added" ? "#166534" : "#1d4ed8";
    const sizeLabel = line.size ? `${Math.max(1, Math.round(line.size / 1024))} KB` : "dir";
    svg.push(
      `<rect x="${sidebarWidth + 44}" y="${y - 20}" width="${centerWidth - 48}" height="38" rx="10" fill="#ffffff" stroke="#edf0f5"/>`,
      `<rect x="${sidebarWidth + 58}" y="${y - 9}" width="64" height="20" rx="10" fill="${statusFill}"/>`,
      `<text x="${sidebarWidth + 74}" y="${y + 5}" font-family="SF Pro Text, Helvetica, Arial" font-size="12" font-weight="700" fill="${statusText}">${escapeXml(line.status.toUpperCase())}</text>`,
      `<text x="${sidebarWidth + 136}" y="${y + 5}" font-family="SF Mono, Menlo, monospace" font-size="15" fill="#111827">${escapeXml(line.path)}</text>`,
      `<text x="${sidebarWidth + 420}" y="${y + 5}" font-family="SF Mono, Menlo, monospace" font-size="14" fill="#4b5563">${escapeXml(line.scope)}</text>`,
      `<text x="${sidebarWidth + 560}" y="${y + 5}" font-family="SF Mono, Menlo, monospace" font-size="14" fill="#4b5563">${escapeXml(sizeLabel)}</text>`
    );
  });

  rightLines.forEach((line, index) => {
    svg.push(
      `<text x="${sidebarWidth + centerWidth + 44}" y="${110 + index * 38}" font-family="SF Mono, Menlo, monospace" font-size="19" fill="#dbe5f0">${escapeXml(line)}</text>`
    );
  });

  svg.push("</svg>");
  const outputPath = join(artifacts.data, "file-explorer.svg");
  writeFileSync(outputPath, `${svg.join("\n")}\n`, "utf8");
  return outputPath;
}
