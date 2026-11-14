import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Attachment, CharacterId, StageEvent } from "@odyssey/contracts";
import { episodes, findEpisode, getCharacter, passages, search } from "@odyssey/story";

export type ToolState = {
  character: CharacterId;
  events: StageEvent[];
  attachments: Attachment[];
  ended: boolean;
  takeaway?: string;
};

export function runTool(name: string, args: Record<string, unknown>, state: ToolState, character = getCharacter): Record<string, unknown> {
  const string = (key: string) => {
    const value = args[key];
    if (typeof value !== "string" || !value.trim()) throw new Error(`Expected ${key}`);
    return value;
  };
  try {
    if (state.ended) throw new Error("Session already ended");
    switch (name) {
      case "search_odyssey": return { passages: search(string("query")) };
      case "find_episode": return { episodes: findEpisode(string("problem")) };
      case "highlight_passage": {
        const ids = args.passage_ids;
        if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && passages.some(p => p.id === id))) {
          throw new Error("Unknown or empty passage_ids");
        }
        state.events.push({ type: "highlight", passageIds: ids });
        return { ok: true };
      }
      case "show_scene": {
        const id = string("scene_id");
        if (!episodes.some(e => e.sceneId === id) || !/^[a-z0-9_-]+$/i.test(id)) throw new Error("Unknown scene_id");
        // Role 4's committed assets are the allowlist until its final handoff arrives.
        if (!existsSync(fileURLToPath(new URL(`../../assets/scenes/${id}.png`, import.meta.url)))) throw new Error("Scene image not available yet");
        const base = process.env.PUBLIC_BASE_URL?.trim() || process.env.STAGE_URL?.trim() || "http://localhost:3000";
        const url = new URL(`/assets/scenes/${id}.png`, base).href;
        state.events.push({ type: "scene", sceneId: id });
        state.attachments.push({ kind: "image", url, alt: id });
        return { ok: true };
      }
      case "show_map": {
        const id = string("location_id");
        // Final image-backed location allowlist must come from Role 4.
        return { error: `Map display unavailable until Role 4 confirms location assets (${id})` };
      }
      case "switch_character": {
        const id = string("character") as CharacterId;
        if (!["athena", "odysseus", "poseidon", "circe"].includes(id) || !character(id)) throw new Error("Character data not available");
        state.character = id;
        state.events.push({ type: "character", character: id });
        return { character: character(id) };
      }
      case "end_session":
        state.takeaway = string("takeaway");
        state.ended = true;
        return { ok: true, takeaway: state.takeaway, summaryCardAvailable: false };
      default: throw new Error("Unknown tool");
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Tool failed" };
  }
}
