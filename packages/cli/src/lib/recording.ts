import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { E2EConfig, LocalState } from "../types.ts";
import type { ArtifactPaths } from "./artifacts.ts";
import { runCommand, runStreaming, type StreamingCommand } from "./exec.ts";
import { waitForMinecraftWindowId } from "./macos.ts";
import type { TimelineWriter } from "./timeline.ts";

type RecordingHandle = {
  provider: "native" | "ffmpeg";
  stop(): Promise<string | null>;
};

function listScreenCaptureDevice(): string {
  const probe = runCommand(["ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
  const output = `${probe.stdout}\n${probe.stderr}`;
  const match = output.match(/\[(\d+)\]\s+Capture screen 0/);
  if (match) {
    return `${match[1]}:none`;
  }
  const fallback = output.match(/\[(\d+)\]\s+Capture screen \d+/);
  if (!fallback) {
    throw new Error("Could not find a screen capture device for ffmpeg");
  }
  return `${fallback[1]}:none`;
}

async function startFfmpegRecording(
  artifacts: ArtifactPaths,
  timeline: TimelineWriter
): Promise<RecordingHandle> {
  const outputPath = join(artifacts.video, "raw.mp4");
  const device = listScreenCaptureDevice();
  const process = runStreaming([
    "ffmpeg",
    "-y",
    "-f",
    "avfoundation",
    "-framerate",
    "30",
    "-capture_cursor",
    "0",
    "-i",
    device,
    "-pix_fmt",
    "yuv420p",
    outputPath
  ]);
  timeline.write({
    type: "recording.started",
    provider: "ffmpeg",
    path: outputPath
  });
  return {
    provider: "ffmpeg",
    async stop(): Promise<string | null> {
      await process.stop("SIGINT");
      timeline.write({
        type: "recording.stopped",
        provider: "ffmpeg",
        path: outputPath
      });
      return outputPath;
    }
  };
}

async function startNativeRecording(
  _state: LocalState,
  artifacts: ArtifactPaths,
  timeline: TimelineWriter
): Promise<RecordingHandle> {
  const outputPath = join(artifacts.video, "raw.mov");
  const windowId = await waitForMinecraftWindowId(30_000);
  const process = runStreaming([
    "screencapture",
    "-x",
    "-v",
    `-l${windowId}`,
    outputPath
  ]);
  timeline.write({
    type: "recording.started",
    provider: "native",
    path: outputPath,
    windowId
  });

  return {
    provider: "native",
    async stop(): Promise<string | null> {
      await process.stop("SIGINT");
      timeline.write({
        type: "recording.stopped",
        provider: "native",
        path: outputPath
      });
      return outputPath;
    }
  };
}

function escapeAssText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("\n", "\\N");
}

function toAssTime(ms: number): string {
  const total = Math.max(0, ms);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const centiseconds = Math.floor((total % 1_000) / 10);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function eventLabel(event: Record<string, unknown>): string | null {
  switch (event.type) {
    case "scenario.step.started":
      if (event.command) return `CMD ${String(event.command)}`;
      if (event.text) return `WAIT ${String(event.text)}`;
      return `STEP ${String(event.action)}`;
    case "scenario.step.finished":
      if (event.command) return `DONE ${String(event.command)}`;
      if (event.text) return `MATCH ${String(event.text)}`;
      if (event.path) return `${String(event.action)} ${String(event.path)}`;
      return `OK ${String(event.action)}`;
    case "artifact.screenshot":
      return "SHOT saved";
    case "watch.fs":
      return `FILE ${String(event.op)} ${String(event.path)}`;
    case "recording.started":
      return `REC ${String(event.provider)}`;
    case "recording.stopped":
      return "REC stopped";
    case "run.finished":
      return `RUN ${event.ok ? "complete" : "failed"}`;
    default:
      return null;
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shortenMiddle(value: string, max = 44): string {
  if (value.length <= max) {
    return value;
  }

  const head = Math.max(12, Math.floor((max - 3) / 2));
  const tail = Math.max(10, max - head - 3);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function dialogueLine(
  style: string,
  startMs: number,
  endMs: number,
  x: number,
  y: number,
  text: string
): string {
  return `Dialogue: 0,${toAssTime(startMs)},${toAssTime(endMs)},${style},,0,0,0,,{\\pos(${x},${y})}${text}`;
}

function detectContentCrop(rawVideoPath: string, durationMs: number): { width: number; height: number; x: number; y: number } | null {
  const seekSeconds = Math.max(1, Math.min(durationMs / 1000 / 3, 24));
  const probe = runCommand([
    "ffmpeg",
    "-ss",
    seekSeconds.toFixed(2),
    "-i",
    rawVideoPath,
    "-vf",
    "cropdetect=24:16:0",
    "-frames:v",
    "12",
    "-f",
    "null",
    "-"
  ]);
  const output = `${probe.stdout}\n${probe.stderr}`;
  const matches = [...output.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  const lastMatch = matches.at(-1);
  if (!lastMatch) {
    return null;
  }

  const [, width, height, x, y] = lastMatch;
  return {
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y)
  };
}

export function composeRunVideo(
  rawVideoPath: string,
  artifacts: ArtifactPaths,
  config: E2EConfig
): string | null {
  if (!config.recording.composeRightPanel) {
    return rawVideoPath;
  }

  const probe = runCommand([
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    rawVideoPath
  ]);
  if (!probe.ok) {
    return rawVideoPath;
  }

  const metadata = JSON.parse(probe.stdout) as {
    streams: Array<{ width: number; height: number }>;
    format: { duration: string };
  };
  const width = metadata.streams[0]?.width ?? 1280;
  const height = metadata.streams[0]?.height ?? 720;
  const durationMs = Math.ceil(Number(metadata.format.duration ?? 0) * 1000);
  const crop = detectContentCrop(rawVideoPath, durationMs);
  const contentWidth = crop?.width ?? width;
  const contentHeight = crop?.height ?? height;
  const timelinePath = join(artifacts.data, "timeline.jsonl");
  const assPath = join(artifacts.video, "panel.ass");
  const outputPath = join(artifacts.video, "composited.mp4");
  const uiScale = Math.min(1.6, Math.max(1, contentHeight / 900));
  const panelPadding = Math.round(18 * uiScale);
  const panelX = contentWidth + panelPadding;
  const panelInnerWidth = config.recording.panelWidth - panelPadding * 2;
  const heroHeight = Math.round(116 * uiScale);
  const filesCardY = heroHeight + Math.round(32 * uiScale);
  const filesCardHeight = Math.max(Math.round(316 * uiScale), Math.round(contentHeight * 0.27));
  const recentCardY = filesCardY + filesCardHeight + Math.round(12 * uiScale);
  const recentCardHeight = Math.max(Math.round(320 * uiScale), contentHeight - recentCardY - panelPadding);
  const titleY = Math.round(46 * uiScale);
  const subtitleY = Math.round(80 * uiScale);
  const statsY = Math.round(108 * uiScale);
  const filesHeadingY = filesCardY + Math.round(30 * uiScale);
  const recentHeadingY = recentCardY + Math.round(34 * uiScale);
  const fileStartY = filesCardY + Math.round(76 * uiScale);
  const recentStartY = recentCardY + Math.round(84 * uiScale);
  const rowHeight = Math.round(42 * uiScale);
  const statusX = panelX + Math.round(14 * uiScale);
  const fileTextX = panelX + Math.round(74 * uiScale);
  const fileMetaX = panelX + panelInnerWidth - Math.round(10 * uiScale);
  const recentTimeX = panelX + Math.round(14 * uiScale);
  const recentTextX = panelX + Math.round(96 * uiScale);
  const events = readFileSync(timelinePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.type !== "service.log");
  const fileState = new Map<
    string,
    {
      key: string;
      op: string;
      scope: string;
      path: string;
      sizeLabel: string;
      tMs: number;
    }
  >();
  const sections = [
    "[Script Info]",
    `PlayResX: ${contentWidth + config.recording.panelWidth}`,
    `PlayResY: ${contentHeight}`,
    "ScriptType: v4.00+",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Kicker,Avenir Next Demi Bold,${Math.round(13 * uiScale)},&H008B949E,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Title,Avenir Next Demi Bold,${Math.round(24 * uiScale)},&H00C9D1D9,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Subtitle,Avenir Next Regular,${Math.round(14 * uiScale)},&H008B949E,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Section,Avenir Next Demi Bold,${Math.round(16 * uiScale)},&H00C9D1D9,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Meta,SF Mono,${Math.round(12 * uiScale)},&H008B949E,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,0,0,0,1`,
    `Style: FileStatus,SF Mono,${Math.round(12 * uiScale)},&H00C9D1D9,&H000000FF,&H000D1117,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: FileText,Avenir Next Demi Bold,${Math.round(15 * uiScale)},&H00C9D1D9,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: FileMeta,SF Mono,${Math.round(12 * uiScale)},&H008B949E,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,0,0,0,1`,
    `Style: EventTime,SF Mono,${Math.round(12 * uiScale)},&H008B949E,&H000000FF,&H000D1117,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: EventText,Avenir Next Regular,${Math.round(14 * uiScale)},&H00C9D1D9,&H000000FF,&H000D1117,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ];

  let previousState = "";
  let segmentStart = 0;

  for (let sample = 0; sample <= durationMs + 500; sample += 500) {
    for (const event of events) {
      const tMs = Number(event.tMs ?? 0);
      if (tMs > sample) {
        break;
      }
      if (event.type === "watch.fs") {
        const key = `${String(event.scope)}/${String(event.path)}`;
        if (event.op === "remove") {
          fileState.delete(key);
        } else {
          fileState.set(key, {
            key,
            op: String(event.op),
            scope: String(event.scope),
            path: String(event.path),
            sizeLabel: typeof event.size === "number" ? `${Math.max(1, Math.round(Number(event.size) / 1024))} KB` : "--",
            tMs
          });
        }
      }
    }

    const recent = events
      .filter((event) => Number(event.tMs ?? 0) <= sample)
      .map((event) => {
        const label = eventLabel(event);
        if (!label) {
          return null;
        }

        return {
          label: shortenMiddle(label, 46),
          at: formatElapsed(Number(event.tMs ?? 0))
        };
      })
      .filter((value): value is { label: string; at: string } => Boolean(value))
      .slice(-6);

    const files = [...fileState.values()]
      .sort((left, right) => right.tMs - left.tMs)
      .slice(0, 5)
      .map((file) => ({
        status: file.op.toUpperCase(),
        path: shortenMiddle(file.path, 34),
        scope: shortenMiddle(file.scope, 12),
        sizeLabel: file.sizeLabel
      }));

    const state = JSON.stringify({
      elapsed: formatElapsed(sample),
      fileCount: fileState.size,
      eventCount: events.filter((event) => Number(event.tMs ?? 0) <= sample && eventLabel(event)).length,
      files,
      recent
    });

    if (state === previousState) {
      continue;
    }

    if (previousState) {
      const snapshot = JSON.parse(previousState) as {
        elapsed: string;
        fileCount: number;
        eventCount: number;
        files: Array<{ status: string; path: string; scope: string; sizeLabel: string }>;
        recent: Array<{ label: string; at: string }>;
      };
      const endMs = sample;

      sections.push(dialogueLine("Kicker", segmentStart, endMs, panelX, titleY - Math.round(18 * uiScale), "RUNTIME SIDEBAR"));
      sections.push(dialogueLine("Title", segmentStart, endMs, panelX, titleY, "Plugin Portal E2E"));
      sections.push(
        dialogueLine(
          "Subtitle",
          segmentStart,
          endMs,
          panelX,
          subtitleY,
          `Files ${String(snapshot.fileCount).padStart(2, "0")}  |  Events ${String(snapshot.eventCount).padStart(2, "0")}  |  Elapsed ${snapshot.elapsed}`
        )
      );
      sections.push(dialogueLine("Meta", segmentStart, endMs, panelX + panelInnerWidth, statsY, "github-dark"));
      sections.push(dialogueLine("Section", segmentStart, endMs, panelX, filesHeadingY, "Tracked Files"));

      if (snapshot.files.length === 0) {
        sections.push(dialogueLine("EventText", segmentStart, endMs, panelX, fileStartY, "No watched file changes yet."));
      } else {
        snapshot.files.forEach((file, index) => {
          const y = fileStartY + index * rowHeight;
          const statusText = file.status.padEnd(6, " ");
          sections.push(
            dialogueLine(
              "FileStatus",
              segmentStart,
              endMs,
              statusX,
              y,
              escapeAssText(statusText)
            )
          );
          sections.push(dialogueLine("FileText", segmentStart, endMs, fileTextX, y, escapeAssText(file.path)));
          sections.push(
            dialogueLine(
              "FileMeta",
              segmentStart,
              endMs,
              fileMetaX,
              y,
              escapeAssText(`${file.scope}  ${file.sizeLabel}`)
            )
          );
        });
      }

      sections.push(dialogueLine("Section", segmentStart, endMs, panelX, recentHeadingY, "Recent Activity"));
      if (snapshot.recent.length === 0) {
        sections.push(dialogueLine("EventText", segmentStart, endMs, panelX, recentStartY, "Waiting for scenario activity."));
      } else {
        snapshot.recent.forEach((entry, index) => {
          const y = recentStartY + index * rowHeight;
          sections.push(dialogueLine("EventTime", segmentStart, endMs, recentTimeX, y, escapeAssText(entry.at)));
          sections.push(dialogueLine("EventText", segmentStart, endMs, recentTextX, y, escapeAssText(entry.label)));
        });
      }
    }

    previousState = state;
    segmentStart = sample;
  }

  if (previousState) {
    const snapshot = JSON.parse(previousState) as {
      elapsed: string;
      fileCount: number;
      eventCount: number;
      files: Array<{ status: string; path: string; scope: string; sizeLabel: string }>;
      recent: Array<{ label: string; at: string }>;
    };
    const endMs = durationMs + 500;
    sections.push(dialogueLine("Kicker", segmentStart, endMs, panelX, titleY - Math.round(18 * uiScale), "RUNTIME SIDEBAR"));
    sections.push(dialogueLine("Title", segmentStart, endMs, panelX, titleY, "Plugin Portal E2E"));
    sections.push(
      dialogueLine(
        "Subtitle",
        segmentStart,
        endMs,
        panelX,
        subtitleY,
        `Files ${String(snapshot.fileCount).padStart(2, "0")}  |  Events ${String(snapshot.eventCount).padStart(2, "0")}  |  Elapsed ${snapshot.elapsed}`
      )
    );
    sections.push(dialogueLine("Meta", segmentStart, endMs, panelX + panelInnerWidth, statsY, "github-dark"));
    sections.push(dialogueLine("Section", segmentStart, endMs, panelX, filesHeadingY, "Tracked Files"));
    if (snapshot.files.length === 0) {
      sections.push(dialogueLine("EventText", segmentStart, endMs, panelX, fileStartY, "No watched file changes yet."));
    } else {
      snapshot.files.forEach((file, index) => {
        const y = fileStartY + index * rowHeight;
        const statusText = file.status.padEnd(6, " ");
        sections.push(dialogueLine("FileStatus", segmentStart, endMs, statusX, y, escapeAssText(statusText)));
        sections.push(dialogueLine("FileText", segmentStart, endMs, fileTextX, y, escapeAssText(file.path)));
        sections.push(dialogueLine("FileMeta", segmentStart, endMs, fileMetaX, y, escapeAssText(`${file.scope}  ${file.sizeLabel}`)));
      });
    }
    sections.push(dialogueLine("Section", segmentStart, endMs, panelX, recentHeadingY, "Recent Activity"));
    if (snapshot.recent.length === 0) {
      sections.push(dialogueLine("EventText", segmentStart, endMs, panelX, recentStartY, "Waiting for scenario activity."));
    } else {
      snapshot.recent.forEach((entry, index) => {
        const y = recentStartY + index * rowHeight;
        sections.push(dialogueLine("EventTime", segmentStart, endMs, recentTimeX, y, escapeAssText(entry.at)));
        sections.push(dialogueLine("EventText", segmentStart, endMs, recentTextX, y, escapeAssText(entry.label)));
      });
    }
  }

  writeFileSync(assPath, `${sections.join("\n")}\n`, "utf8");

  const filter = [
    crop ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}` : null,
    `pad=iw+${config.recording.panelWidth}:ih:0:0:0x0D1117`,
    `drawbox=x=${contentWidth}:y=0:w=${config.recording.panelWidth}:h=ih:color=0x0D1117@1:t=fill`,
    `drawbox=x=${contentWidth}:y=0:w=2:h=${contentHeight}:color=0x30363D@1:t=fill`,
    `drawbox=x=${contentWidth + panelPadding}:y=${panelPadding}:w=${panelInnerWidth}:h=${heroHeight}:color=0x161B22@1:t=fill`,
    `drawbox=x=${contentWidth + panelPadding}:y=${filesCardY}:w=${panelInnerWidth}:h=${filesCardHeight}:color=0x161B22@1:t=fill`,
    `drawbox=x=${contentWidth + panelPadding}:y=${recentCardY}:w=${panelInnerWidth}:h=${recentCardHeight}:color=0x161B22@1:t=fill`,
    `drawbox=x=${contentWidth + panelPadding}:y=${panelPadding}:w=${panelInnerWidth}:h=${heroHeight}:color=0x30363D@1:t=2`,
    `drawbox=x=${contentWidth + panelPadding}:y=${filesCardY}:w=${panelInnerWidth}:h=${filesCardHeight}:color=0x30363D@1:t=2`,
    `drawbox=x=${contentWidth + panelPadding}:y=${recentCardY}:w=${panelInnerWidth}:h=${recentCardHeight}:color=0x30363D@1:t=2`,
    `ass='${assPath.replaceAll("'", "\\'")}'`
  ].filter(Boolean).join(",");

  const compose = runCommand([
    "ffmpeg",
    "-y",
    "-i",
    rawVideoPath,
    "-vf",
    filter,
    "-pix_fmt",
    "yuv420p",
    outputPath
  ]);

  return compose.ok ? outputPath : rawVideoPath;
}

export async function startRecording(
  state: LocalState,
  artifacts: ArtifactPaths,
  config: E2EConfig,
  timeline: TimelineWriter
): Promise<RecordingHandle | null> {
  if (!config.recording.enabled || config.recording.provider === "none") {
    return null;
  }

  if (config.recording.provider === "native") {
    return await startNativeRecording(state, artifacts, timeline);
  }

  return await startFfmpegRecording(artifacts, timeline);
}
