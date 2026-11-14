import { AGENT_AUDIO_SAMPLE_RATE } from "@odyssey/contracts";
import { mouthLevel } from "./stage.ts";

export type AudioClock = { every: (tick: () => void) => unknown; cancel: (id: unknown) => void };
const clock: AudioClock = {
  every(tick) { const timer = setInterval(tick, 50); timer.unref(); return timer; },
  cancel(id) { clearInterval(id as ReturnType<typeof setInterval>); },
};
const FRAME_BYTES = AGENT_AUDIO_SAMPLE_RATE * 2 * 0.05;
const MAX_BYTES = AGENT_AUDIO_SAMPLE_RATE * 2 * 10;

// Pace both audio and mouth events against the same 50ms clock. Channel must play
// received frames promptly and discard its playback buffer on interruption.
export class AudioOutput {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private completed = false;
  private speaking = false;
  private timer: unknown;
  constructor(private send: (pcm: Buffer) => void, private mouth: (level: number) => void,
    private drained: () => void, private fail: () => void, private time: AudioClock = clock) {
    this.timer = time.every(() => {
      try { this.tick(); } catch { fail(); }
    });
  }
  enqueue(pcm: Buffer) {
    if (pcm.length % 2) throw new Error("Incomplete PCM16 sample");
    if (this.bytes + pcm.length > MAX_BYTES) throw new Error("Audio playback queue overflow");
    if (pcm.length) this.chunks.push(pcm);
    this.bytes += pcm.length;
  }
  complete() { this.completed = true; }
  clear() {
    this.chunks = [];
    this.bytes = 0;
    this.completed = false;
    this.speaking = false;
    this.mouth(0);
  }
  close() { this.time.cancel(this.timer); this.clear(); }
  private tick() {
    if (this.bytes >= FRAME_BYTES || (this.completed && this.bytes)) {
      const length = Math.min(FRAME_BYTES, this.bytes);
      const frame = Buffer.allocUnsafe(length);
      let offset = 0;
      while (offset < length) {
        const chunk = this.chunks[0];
        const count = Math.min(chunk.length, length - offset);
        chunk.copy(frame, offset, 0, count);
        offset += count;
        if (count === chunk.length) this.chunks.shift();
        else this.chunks[0] = chunk.subarray(count);
      }
      this.bytes -= length;
      this.send(frame);
      this.speaking = true;
      this.mouth(mouthLevel(frame));
    } else if (!this.bytes) {
      if (this.speaking) { this.mouth(0); this.speaking = false; }
      if (this.completed) { this.completed = false; this.drained(); }
    }
  }
}
