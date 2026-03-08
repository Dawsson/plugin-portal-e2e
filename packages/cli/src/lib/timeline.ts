import { createWriteStream, type WriteStream } from "node:fs";
import { join } from "node:path";
import type { ArtifactPaths } from "./artifacts.ts";

export type TimelineEvent = Record<string, unknown> & {
  type: string;
};

export class TimelineWriter {
  private readonly startedAt = new Date();
  private readonly startedMs = Date.now();
  private readonly stream: WriteStream;

  constructor(private readonly artifacts: ArtifactPaths) {
    this.stream = createWriteStream(join(artifacts.data, "timeline.jsonl"), {
      flags: "a"
    });
  }

  relativeMs(): number {
    return Date.now() - this.startedMs;
  }

  write(event: TimelineEvent): void {
    const payload = {
      ts: new Date().toISOString(),
      tMs: this.relativeMs(),
      ...event
    };
    this.stream.write(`${JSON.stringify(payload)}\n`);
  }

  startedIso(): string {
    return this.startedAt.toISOString();
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.stream.end(() => resolve());
    });
  }
}
