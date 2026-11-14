import test from "node:test";
import assert from "node:assert/strict";
import { GenerateContentResponse, type GenerateContentParameters, type Part } from "@google/genai";
import { createTextHandler } from "../src/text.ts";
import { runTool, type ToolState } from "../src/tools.ts";

const req = (sessionId = "test", message = "I procrastinate") => ({ sessionId, message, from: "+1", channel: "imessage" as const });
function response(parts: Part[]) {
  return Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: "model", parts } }] });
}
const text = () => response([{ text: "Let us choose one small step." }]);

test("tool loop returns matching response ids and retains model signatures", async () => {
  let round = 0;
  const handle = createTextHandler(async input => {
    if (round++ === 0) return response([{ functionCall: { id: "call1", name: "find_episode", args: { problem: "procrastination" } }, thoughtSignature: "signature" }]);
    const history = input.contents as { parts: Part[] }[];
    assert.equal(history[1].parts[0].thoughtSignature, "signature");
    assert.equal(history[2].parts[0].functionResponse?.id, "call1");
    assert.ok(history[2].parts[0].functionResponse?.response?.episodes);
    return text();
  }, () => {});
  assert.match((await handle(req())).text, /AI playing Athena/);
});

test("concurrent turns serialize; callers have isolated memory", async () => {
  const seen: GenerateContentParameters[] = [];
  const handle = createTextHandler(async input => { seen.push(structuredClone(input)); return text(); }, () => {});
  await Promise.all([handle(req()), handle(req("test", "What next?")), handle(req("other"))]);
  const histories = seen.map(s => s.contents as { parts: Part[] }[]);
  assert.deepEqual(histories.map(h => h.length).sort(), [1, 1, 3]);
});

test("failed generation neither publishes events nor saves incomplete history", async () => {
  let calls = 0;
  const events: unknown[] = [];
  const handle = createTextHandler(async input => {
    if (calls++ === 0) throw new Error("provider failure");
    assert.equal((input.contents as unknown[]).length, 1);
    return text();
  }, (_, event) => events.push(event));
  await assert.rejects(handle(req()), /provider failure/);
  assert.equal(events.length, 0);
  await handle(req());
});

test("end_session clears history and returns the takeaway", async () => {
  let calls = 0;
  const handle = createTextHandler(async input => {
    assert.equal((input.contents as unknown[]).length, 1);
    return calls++ === 0 ? response([{ functionCall: { name: "end_session", args: { takeaway: "Take one step. Repeat tomorrow." } } }]) : text();
  }, () => {});
  assert.equal((await handle(req())).sessionEnded, true);
  assert.match((await handle(req())).text, /AI/);
});

test("unbounded tool loops fail without stage side effects", async () => {
  let calls = 0;
  const handle = createTextHandler(async () => { calls++; return response([{ functionCall: { name: "find_episode", args: { problem: "study" } } }]); }, () => assert.fail("published incomplete turn"));
  await assert.rejects(handle(req()), /tool-call limit/);
  assert.equal(calls, 8);
});

test("tool inputs reject fabricated passages, characters, and missing images", () => {
  const state: ToolState = { character: "athena", events: [], attachments: [], ended: false };
  assert.ok(runTool("highlight_passage", { passage_ids: ["999.1"] }, state).error);
  assert.ok(runTool("switch_character", { character: "poseidon" }, state).error);
  assert.ok(runTool("show_scene", { scene_id: "../../.env" }, state).error);
  assert.ok(runTool("end_session", {}, state).error);
  assert.deepEqual(state.events, []);
  assert.equal(state.ended, false);
});

test("invalid requests do not reach Gemini", async () => {
  const handle = createTextHandler(async () => assert.fail("called Gemini"));
  await assert.rejects(handle(req("", "")), /Invalid TextRequest/);
});
