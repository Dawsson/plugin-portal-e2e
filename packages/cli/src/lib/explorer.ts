import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";

type TimelineEntry = Record<string, unknown> & {
  type: string;
  tMs?: number;
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

  const files = new Map<string, string>();
  const recent: string[] = [];

  for (const entry of entries) {
    if (entry.type === "watch.fs") {
      const key = `${String(entry.scope)}/${String(entry.path)}`;
      if (entry.op === "remove") {
        files.delete(key);
      } else {
        files.set(key, key);
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

  const width = 1200;
  const height = 760;
  const leftWidth = 640;
  const lines = [...files.values()].slice(-14);
  const rightLines = recent.slice(-12);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#f4f2ee"/>`,
    `<rect x="24" y="24" width="${leftWidth}" height="${height - 48}" rx="18" fill="#fbfaf8" stroke="#d5cec3"/>`,
    `<rect x="${leftWidth + 48}" y="24" width="${width - leftWidth - 72}" height="${height - 48}" rx="18" fill="#101820" />`,
    `<text x="48" y="60" font-family="SF Pro Display, Helvetica, Arial" font-size="28" font-weight="700" fill="#1f2933">Files</text>`,
    `<text x="${leftWidth + 72}" y="60" font-family="SF Pro Display, Helvetica, Arial" font-size="28" font-weight="700" fill="#f8fafc">Recent</text>`
  ];

  lines.forEach((line, index) => {
    svg.push(
      `<text x="48" y="${110 + index * 38}" font-family="SF Mono, Menlo, monospace" font-size="22" fill="#344054">${escapeXml(line)}</text>`
    );
  });

  rightLines.forEach((line, index) => {
    svg.push(
      `<text x="${leftWidth + 72}" y="${110 + index * 38}" font-family="SF Mono, Menlo, monospace" font-size="20" fill="#dbe5f0">${escapeXml(line)}</text>`
    );
  });

  svg.push("</svg>");
  const outputPath = join(artifacts.data, "file-explorer.svg");
  writeFileSync(outputPath, `${svg.join("\n")}\n`, "utf8");
  return outputPath;
}
