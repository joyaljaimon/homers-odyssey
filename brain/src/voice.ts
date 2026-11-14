import { GoogleGenAI, Modality, type LiveConnectParameters, type LiveServerMessage, type Session } from "@google/genai";
import { WebSocket, type RawData } from "ws";
import type { StageEvent, VoiceControlMessage } from "@odyssey/contracts";
import { AudioOutput, type AudioClock } from "./audio.ts";
import { declarations, systemPrompt, voices } from "./config.ts";
import { emit } from "./stage.ts";
import { runTool, type ToolState } from "./tools.ts";

type LiveSession = Pick<Session, "sendRealtimeInput" | "sendClientContent" | "sendToolResponse" | "close">;
type Connect = (options: LiveConnectParameters) => Promise<LiveSession>;
const rawBuffer = (data: RawData) => Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);

export function createVoiceHandler(connect: Connect, publish: (id: string, event: StageEvent) => void = emit, clock?: AudioClock) {
  const active = new Set<string>();
  return async function voice(sessionId: string, ws: WebSocket) {
    if (active.has(sessionId)) { ws.close(1008, "Voice session already active"); return; }
    active.add(sessionId);
    let live: LiveSession | undefined;
    let ready = false;
    let closed = false;
    let endTimeout: ReturnType<typeof setTimeout> | undefined;
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    const early: LiveServerMessage[] = [];
    const state: ToolState = { character: "athena", events: [], attachments: [], ended: false };
    const control = (message: VoiceControlMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
    const output = new AudioOutput(pcm => {
      if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1_000_000) throw new Error("Channel cannot keep up");
      ws.send(pcm, { binary: true });
    }, level => publish(sessionId, { type: "mouth", character: state.character, level }),
    () => { if (state.ended) finish(1000, "Session ended"); }, () => finish(1011, "Audio delivery failed"), clock);

    function finish(code: number, reason: string) {
      if (closed) return;
      closed = true;
      active.delete(sessionId);
      clearTimeout(setupTimeout);
      clearTimeout(endTimeout);
      pending = [];
      early.length = 0;
      output.close();
      try { live?.close(); } catch { /* already closed upstream */ }
      control({ type: "ended" });
      if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
    }
    const setupTimeout = setTimeout(() => finish(1011, "Gemini setup timed out"), 15_000);
    setupTimeout.unref();
    ws.on("close", () => finish(1000, "Channel closed"));
    ws.on("error", () => finish(1011, "Channel error"));
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (closed || !isBinary) return;
      try {
        const pcm = rawBuffer(data);
        if (!pcm.length || pcm.length % 2 || pcm.length > 64_000) { finish(1008, "Expected PCM16 audio frames"); return; }
        if (live && ready) live.sendRealtimeInput({ audio: { data: pcm.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
        else {
          pendingBytes += pcm.length;
          if (pendingBytes > 64_000) { finish(1013, "Audio arrived before Gemini was ready"); return; }
          pending.push(pcm);
        }
      } catch { finish(1011, "Audio input failed"); }
    });

    function receive(message: LiveServerMessage) {
      if (closed) return;
      if (!live) {
        if (early.length >= 100) { finish(1011, "Too many setup messages"); return; }
        early.push(message);
        return;
      }
      try {
        if (message.setupComplete && !ready) {
          ready = true;
          clearTimeout(setupTimeout);
          publish(sessionId, { type: "character", character: "athena" });
          live.sendClientContent({ turns: [{ role: "user", parts: [{ text: "Greet the traveler briefly, saying you are an AI playing Athena, then ask what brings them here." }] }], turnComplete: true });
          for (const pcm of pending) live.sendRealtimeInput({ audio: { data: pcm.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
          pending = [];
          pendingBytes = 0;
        }
        if (!ready) return;
        const content = message.serverContent;
        if (content?.interrupted) {
          output.clear();
          control({ type: "interrupted" });
        } else {
          for (const part of content?.modelTurn?.parts ?? []) {
            const audio = part.inlineData;
            if (audio?.data && audio.mimeType?.startsWith("audio/pcm")) {
              const rate = /rate=(\d+)/.exec(audio.mimeType)?.[1];
              if (rate && rate !== "24000") throw new Error("Unexpected audio rate");
              output.enqueue(Buffer.from(audio.data, "base64"));
            }
          }
          if (content?.outputTranscription?.text) publish(sessionId, { type: "caption", text: content.outputTranscription.text });
        }
        const calls = message.toolCall?.functionCalls ?? [];
        if (calls.length) {
          const functionResponses = calls.map(call => ({
            id: call.id, name: call.name,
            response: call.name === "switch_character"
              ? { error: "Voice character handoff is not available yet; continue as Athena." }
              : runTool(call.name ?? "", call.args ?? {}, state),
          }));
          live.sendToolResponse({ functionResponses });
          for (const event of state.events.splice(0)) publish(sessionId, event);
          // Gemini speaks the takeaway before turnComplete; do not cut its audio off.
          if (state.ended && !endTimeout) {
            endTimeout = setTimeout(() => finish(1011, "Final takeaway timed out"), 35_000);
            endTimeout.unref();
          }
        }
        if (content?.turnComplete) output.complete();
      } catch { finish(1011, "Gemini response failed"); }
    }

    try {
      const connected = await connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `${systemPrompt("athena")}\nIn voice mode, speak your AI disclosure first. After end_session, speak its takeaway and finish your turn. Character switching is not available yet.`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices.athena } } },
          tools: [{ functionDeclarations: declarations }],
          outputAudioTranscription: {},
        },
        callbacks: {
          onmessage: receive,
          onerror: () => finish(1011, "Gemini connection failed"),
          onclose: () => finish(1011, "Gemini disconnected"),
        },
      });
      if (closed) { connected.close(); return; }
      live = connected;
      for (const message of early.splice(0)) receive(message);
    } catch { finish(1011, "Gemini connection failed"); }
  };
}

let handler: ReturnType<typeof createVoiceHandler> | undefined;
export function handleVoice(sessionId: string, ws: WebSocket) {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    // Keep the original silent socket stub available for no-key integration.
    ws.on("error", () => {});
    return;
  }
  if (!handler) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    handler = createVoiceHandler(options => ai.live.connect(options));
  }
  void handler(sessionId, ws).catch(() => { if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Voice setup failed"); });
}
