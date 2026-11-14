// Fan-out of stage events to every stage page open for a session.
import type { WebSocket } from "ws";
import type { StageEvent } from "@odyssey/contracts";

const stages = new Map<string, Set<WebSocket>>();

export function registerStage(sessionId: string, ws: WebSocket) {
  const set = stages.get(sessionId) ?? new Set();
  set.add(ws);
  stages.set(sessionId, set);
  ws.on("close", () => {
    set.delete(ws);
    if (!set.size && stages.get(sessionId) === set) stages.delete(sessionId);
  });
  ws.on("error", () => set.delete(ws));
}

export function emit(sessionId: string, event: StageEvent) {
  const msg = JSON.stringify(event);
  for (const ws of stages.get(sessionId) ?? []) {
    if (ws.readyState === 1) ws.send(msg, err => { if (err) ws.close(); });
  }
}

// Loudness of a PCM16 chunk scaled to 0..1, for `mouth` events.
export function mouthLevel(pcm16: Buffer): number {
  let sum = 0;
  const n = Math.floor(pcm16.length / 2);
  for (let i = 0; i < n; i++) {
    const s = pcm16.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return n ? Math.min(1, Math.sqrt(sum / n) * 4) : 0; // TODO(brain): tune the * 4 with Role 4
}
