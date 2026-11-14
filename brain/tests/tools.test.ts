import test from "node:test";
import assert from "node:assert/strict";
import { episodes, passages } from "@odyssey/story";
import { runTool, type ToolState } from "../src/tools.ts";
const state = (): ToolState => ({ sessionId: "caller & ?/#", character: "athena", events: [], attachments: [], ended: false });

test("episode scenes emit fallback events without missing image attachments", () => {
  const s = state();
  const result = runTool("show_scene", { scene_id: episodes[0].sceneId }, s);
  assert.equal(result.ok, true);
  assert.equal(s.episodeId, episodes[0].id);
  assert.equal(result.title, episodes[0].title);
  assert.deepEqual(s.events, [{ type: "scene", sceneId: episodes[0].sceneId }]);
  assert.equal(s.attachments.length, result.imageAttached ? 1 : 0);
});

test("all episode locations work; invented ids do not mutate the stage", () => {
  for (const episode of episodes) {
    const s = state();
    assert.equal(runTool("show_map", { location_id: episode.locationId }, s).ok, true);
    assert.deepEqual(s.events, [{ type: "map", locationId: episode.locationId }]);
  }
  const s = state();
  assert.ok(runTool("show_map", { location_id: "invented" }, s).error);
  assert.ok(runTool("show_scene", { scene_id: "invented" }, s).error);
  assert.deepEqual(s.events, []);
});

test("card URL round-trips session, episode, selected quote, and Unicode takeaway", () => {
  const s = state();
  runTool("show_scene", { scene_id: episodes[0].sceneId }, s);
  runTool("highlight_passage", { passage_ids: [passages[0].id] }, s);
  const takeaway = "Make a plan & stick to it. Try “one step” tomorrow.";
  const result = runTool("end_session", { takeaway }, s);
  assert.equal(result.ok, true);
  const attachment = s.attachments.at(-1)!;
  const url = new URL(attachment.url);
  assert.equal(url.pathname, "/card");
  assert.equal(url.searchParams.get("sessionId"), s.sessionId);
  assert.equal(url.searchParams.get("episode"), episodes[0].id);
  assert.equal(url.searchParams.get("quote"), passages[0].id);
  assert.equal(url.searchParams.get("takeaway"), takeaway);
  assert.equal(url.searchParams.get("character"), "athena");
  assert.equal(s.ended, true);
});

test("invalid takeaways are retryable; cards never invent missing episode/quote ids", () => {
  const s = state();
  for (const takeaway of ["Only one sentence.", "One. Two. Three.", `${"Long ".repeat(70)}. Done.`]) {
    assert.ok(runTool("end_session", { takeaway }, s).error);
    assert.equal(s.ended, false);
    assert.deepEqual(s.attachments, []);
  }
  assert.equal(runTool("end_session", { takeaway: "Choose a step. Try it tomorrow." }, s).ok, true);
  const url = new URL(s.attachments[0].url);
  assert.equal(url.searchParams.has("episode"), false);
  assert.equal(url.searchParams.has("quote"), false);
});
