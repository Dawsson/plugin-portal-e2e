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

function escapeAss(value: string): string {
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
      if (event.command) return `Start ${String(event.command)}`;
      if (event.text) return `Start ${String(event.text)}`;
      return `Start ${String(event.action)}`;
    case "scenario.step.finished":
      if (event.command) return `Done ${String(event.command)}`;
      if (event.text) return `Matched ${String(event.text)}`;
      if (event.path) return `${String(event.action)} ${String(event.path)}`;
      return `${String(event.action)} ok`;
    case "artifact.screenshot":
      return `Screenshot ${String(event.path ?? "")}`;
    case "watch.fs":
      return `${String(event.op)} ${String(event.scope)}/${String(event.path)}`;
    case "recording.started":
      return `Recording started (${String(event.provider)})`;
    case "recording.stopped":
      return `Recording stopped`;
    case "run.finished":
      return `Run ${event.ok ? "finished" : "failed"}`;
    default:
      return null;
  }
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
  const timelinePath = join(artifacts.data, "timeline.jsonl");
  const assPath = join(artifacts.video, "panel.ass");
  const outputPath = join(artifacts.video, "composited.mp4");
  const events = readFileSync(timelinePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.type !== "service.log");

  const fileState = new Map<string, string>();
  const sections = [
    "[Script Info]",
    `PlayResX: ${width + config.recording.panelWidth}`,
    `PlayResY: ${height}`,
    "ScriptType: v4.00+",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Panel,Menlo,22,&H00F2F2F2,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,1,0,7,${width + 24},24,24,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ];

  let previousText = "";
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
          fileState.set(key, key);
        }
      }
    }

    const recent = events
      .filter((event) => Number(event.tMs ?? 0) <= sample)
      .map(eventLabel)
      .filter((value): value is string => Boolean(value))
      .slice(-6);

    const files = [...fileState.values()].slice(-6);
    const text = escapeAss([
      "Plugin Portal E2E",
      "",
      "Files",
      ...(files.length ? files : ["(none)"]),
      "",
      "Recent",
      ...(recent.length ? recent : ["(no events yet)"])
    ].join("\n"));

    if (text === previousText) {
      continue;
    }

    if (previousText) {
      sections.push(`Dialogue: 0,${toAssTime(segmentStart)},${toAssTime(sample)},Panel,,0,0,0,,${previousText}`);
    }

    previousText = text;
    segmentStart = sample;
  }

  if (previousText) {
    sections.push(`Dialogue: 0,${toAssTime(segmentStart)},${toAssTime(durationMs + 500)},Panel,,0,0,0,,${previousText}`);
  }

  writeFileSync(assPath, `${sections.join("\n")}\n`, "utf8");

  const filter = [
    `pad=iw+${config.recording.panelWidth}:ih:0:0:0x101820`,
    `drawbox=x=iw-${config.recording.panelWidth}:y=0:w=${config.recording.panelWidth}:h=ih:color=0x101820@0.92:t=fill`,
    `ass='${assPath.replaceAll("'", "\\'")}'`
  ].join(",");

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
