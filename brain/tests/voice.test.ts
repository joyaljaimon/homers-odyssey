import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { LiveConnectParameters, LiveServerMessage, Session } from "@google/genai";
import type { WebSocket } from "ws";
import type { StageEvent } from "@odyssey/contracts";
import { passages } from "@odyssey/story";
import { AudioOutput, type AudioClock } from "../src/audio.ts";
import { createVoiceHandler } from "../src/voice.ts";

class Channel extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: (Buffer | string)[] = [];
  code?: number;
  send(data: Buffer | string) { this.sent.push(data); }
  close(code: number) { this.code = code; this.readyState = 3; this.emit("close"); }
  get socket() { return this as unknown as WebSocket; }
}
function fakeClock() {
  let tick = () => {};
  let cancelled = false;
  const clock: AudioClock = { every(fn) { tick = fn; return 1; }, cancel() { cancelled = true; } };
  return { clock, tick: () => { if (!cancelled) tick(); }, cancelled: () => cancelled };
}
function fixture(setupComplete = true) {
  let options!: LiveConnectParameters;
  const realtime: unknown[] = [], toolResponses: unknown[] = [], greetings: unknown[] = [];
  let closed = 0;
  const live: Pick<Session, "sendRealtimeInput" | "sendToolResponse" | "sendClientContent" | "close"> = {
    sendRealtimeInput(input) { realtime.push(input); }, sendToolResponse(input) { toolResponses.push(input); },
    sendClientContent(input) { greetings.push(input); }, close() { closed++; },
  };
  const channel = new Channel();
  const events: StageEvent[] = [];
  const time = fakeClock();
  const handler = createVoiceHandler(async input => {
    options = input;
    if (setupComplete) input.callbacks.onmessage({ setupComplete: {} } as LiveServerMessage);
    return live;
  }, (_, event) => events.push(event), time.clock);
  const receive = (message: object) => options.callbacks.onmessage(message as LiveServerMessage);
  return { channel, live, events, time, handler, receive, realtime, toolResponses, greetings, options: () => options, closed: () => closed };
}

test("voice forwards PCM16 input and paces every output part with mouth events", async () => {
  const f = fixture();
  await f.handler("call", f.channel.socket);
  assert.deepEqual(f.options().config?.speechConfig, { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } });
  assert.match(JSON.stringify(f.greetings), /AI playing Athena/);
  f.channel.emit("message", Buffer.from([1, 0, 2, 0]), true);
  assert.deepEqual(f.realtime[0], { audio: { data: "AQACAA==", mimeType: "audio/pcm;rate=16000" } });
  const audio = (size: number) => ({ inlineData: { mimeType: "audio/pcm;rate=24000", data: Buffer.alloc(size, 32).toString("base64") } });
  f.receive({ serverContent: { modelTurn: { parts: [audio(2400), audio(1200)] }, outputTranscription: { text: "Hello" }, turnComplete: true } });
  assert.equal(f.channel.sent.length, 0);
  f.time.tick(); f.time.tick(); f.time.tick();
  assert.deepEqual(f.channel.sent.filter(Buffer.isBuffer).map(p => p.length), [2400, 1200]);
  assert.ok(f.events.some(e => e.type === "mouth" && e.level > 0));
  assert.equal(f.events.filter(e => e.type === "mouth").length, 2);
  assert.ok(f.events.filter(e => e.type === "mouth").every(e => e.character === "athena"));
  assert.ok(f.events.some(e => e.type === "caption" && e.text === "Hello"));
  f.channel.close(1000);
  assert.equal(f.closed(), 1);
  assert.equal(f.time.cancelled(), true);
});

test("interruptions discard pending audio and notify Channel", async () => {
  const f = fixture(); await f.handler("call", f.channel.socket);
  f.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: Buffer.alloc(4800).toString("base64") } }] } } });
  f.receive({ serverContent: { interrupted: true, turnComplete: true } });
  f.time.tick();
  assert.equal(f.channel.sent.filter(Buffer.isBuffer).length, 0);
  assert.ok(f.channel.sent.includes('{"type":"interrupted"}'));
  assert.equal(f.events.filter(e => e.type === "mouth").length, 0);
  f.channel.close(1000);
});

test("voice tools return matching ids and emit validated highlights", async () => {
  const f = fixture(); await f.handler("call", f.channel.socket);
  f.receive({ toolCall: { functionCalls: [{ id: "quote", name: "highlight_passage", args: { passage_ids: [passages[0].id] } }] } });
  assert.deepEqual(f.toolResponses[0], { functionResponses: [{ id: "quote", name: "highlight_passage", response: { ok: true } }] });
  assert.ok(f.events.some(e => e.type === "highlight" && e.passageIds[0] === passages[0].id));
  f.channel.close(1000);
});

test("end_session waits for the final audio to drain", async () => {
  const f = fixture(); await f.handler("call", f.channel.socket);
  f.receive({ toolCall: { functionCalls: [{ id: "end", name: "end_session", args: { takeaway: "Take one step. Try tomorrow." } }] } });
  assert.equal(f.channel.readyState, 1);
  f.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: Buffer.alloc(2400).toString("base64") } }] }, turnComplete: true } });
  f.time.tick(); assert.equal(f.channel.readyState, 1);
  f.time.tick(); assert.equal(f.channel.code, 1000);
  assert.ok(f.channel.sent.includes('{"type":"ended"}'));
});

test("connection errors, slow Channel, and malformed audio release the session", async () => {
  const f = fixture(); await f.handler("call", f.channel.socket);
  f.channel.emit("message", Buffer.from([1]), true);
  assert.equal(f.channel.code, 1008);
  assert.equal(f.closed(), 1);
  const g = fixture(); await g.handler("call", g.channel.socket);
  g.channel.bufferedAmount = 1_000_001;
  g.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: Buffer.alloc(2400).toString("base64") } }] } } });
  g.time.tick(); assert.equal(g.channel.code, 1011);
  const h = fixture(); await h.handler("call", h.channel.socket);
  h.options().callbacks.onerror?.({} as ErrorEvent);
  assert.equal(h.channel.code, 1011);
  assert.equal(h.time.cancelled(), true);
});

test("a late Gemini connection is closed if Channel disconnects during setup", async () => {
  const f = fixture();
  let resolve!: (value: typeof f.live) => void;
  const handler = createVoiceHandler(() => new Promise(done => { resolve = done; }), () => {}, f.time.clock);
  const connecting = handler("call", f.channel.socket);
  f.channel.close(1000);
  resolve(f.live);
  await connecting;
  assert.equal(f.closed(), 1);
});

test("a duplicate call cannot share one session id", async () => {
  const f = fixture(); await f.handler("call", f.channel.socket);
  const duplicate = new Channel(); await f.handler("call", duplicate.socket);
  assert.equal(duplicate.code, 1008);
  assert.equal(f.channel.readyState, 1);
  f.channel.close(1000);
});

test("audio and greeting wait for setupComplete, not merely an open socket", async () => {
  const f = fixture(false); await f.handler("call", f.channel.socket);
  f.channel.emit("message", Buffer.from([1, 0]), true);
  assert.equal(f.realtime.length, 0);
  assert.equal(f.greetings.length, 0);
  f.receive({ setupComplete: {} });
  assert.equal(f.realtime.length, 1);
  assert.equal(f.greetings.length, 1);
  f.receive({ setupComplete: {} });
  assert.equal(f.greetings.length, 1);
  f.channel.close(1000);
});

test("audio output bounds its queue and rejects partial PCM samples", () => {
  const time = fakeClock();
  const output = new AudioOutput(() => {}, () => {}, () => {}, () => {}, time.clock);
  assert.throws(() => output.enqueue(Buffer.alloc(1)), /PCM16/);
  assert.throws(() => output.enqueue(Buffer.alloc(480002)), /overflow/);
  output.close();
});

test("character handoff opens a new voice with context and ignores stale callbacks", async () => {
  const options: LiveConnectParameters[] = [];
  const closes: number[] = [];
  const replies: unknown[] = [];
  const events: StageEvent[] = [];
  const channel = new Channel();
  const time = fakeClock();
  const guide = (id: string) => ["athena", "odysseus"].includes(id)
    ? { id: id as "athena" | "odysseus", name: id, bio: "Test guide", tone: "Test tone", speechRules: [], sampleLines: [], voice: id === "athena" ? "Kore" : "Charon" }
    : undefined;
  const handler = createVoiceHandler(async input => {
    const index = options.push(input) - 1;
    input.callbacks.onmessage({ setupComplete: {} } as LiveServerMessage);
    return {
      sendRealtimeInput() {}, sendClientContent() {}, sendToolResponse(value) { replies.push(value); },
      close() { closes.push(index); input.callbacks.onclose?.({} as CloseEvent); },
    };
  }, (_, event) => events.push(event), time.clock, guide);
  await handler("call", channel.socket);
  const original = options[0].callbacks;
  original.onmessage({ serverContent: { inputTranscription: { text: "I keep postponing studying" } } } as LiveServerMessage);
  original.onmessage({ toolCall: { functionCalls: [{ id: "switch", name: "switch_character", args: { character: "odysseus" } }] } } as LiveServerMessage);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(options.length, 2);
  assert.deepEqual(closes, [0]);
  assert.match(String(options[1].config?.systemInstruction), /AI playing Odysseus/);
  assert.match(String(options[1].config?.systemInstruction), /postponing studying/);
  assert.deepEqual(options[1].config?.speechConfig, { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } });
  assert.ok(events.some(e => e.type === "character" && e.character === "odysseus"));
  assert.equal(channel.readyState, 1);
  original.onclose?.({} as CloseEvent);
  original.onerror?.({} as ErrorEvent);
  original.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: Buffer.alloc(2400).toString("base64") } }] } } } as LiveServerMessage);
  time.tick();
  assert.equal(channel.sent.filter(Buffer.isBuffer).length, 0);
  assert.equal(channel.readyState, 1);
  assert.equal(replies.length, 1);
  options[1].callbacks.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: Buffer.alloc(2400, 32).toString("base64") } }] } } } as LiveServerMessage);
  time.tick();
  assert.ok(events.some(e => e.type === "mouth" && e.character === "odysseus"));
  assert.ok(events.filter(e => e.type === "character").every(e => e.side === undefined));
  channel.close(1000);
  assert.deepEqual(closes, [0, 1]);
});

test("unavailable character handoff returns an error without closing Athena", async () => {
  const f = fixture(); await f.handler("call", f.channel.socket);
  f.receive({ toolCall: { functionCalls: [{ id: "missing", name: "switch_character", args: { character: "poseidon" } }] } });
  assert.match(JSON.stringify(f.toolResponses), /Character data not available/);
  assert.equal(f.closed(), 0);
  assert.equal(f.channel.readyState, 1);
  f.channel.close(1000);
});
