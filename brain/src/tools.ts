import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Attachment, CharacterId, StageEvent } from "@odyssey/contracts";
import { episodes, findEpisode, getCharacter, passages, search } from "@odyssey/story";

export type ToolState = {
  sessionId?: string;
  episodeId?: string;
  quoteId?: string;
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
        state.quoteId = ids[0];
        return { ok: true };
      }
      case "show_scene": {
        const id = string("scene_id");
        const episode = episodes.find(e => e.sceneId === id);
        if (!episode || !/^[a-z0-9_-]+$/i.test(id)) throw new Error("Unknown scene_id");
        // Stage renders its title/summary fallback even when no scene PNG exists.
        const hasImage = existsSync(fileURLToPath(new URL(`../../assets/scenes/${id}.png`, import.meta.url)));
        let attachment: Attachment | undefined;
        if (hasImage) {
          const base = process.env.PUBLIC_BASE_URL?.trim() || process.env.STAGE_URL?.trim() || "http://localhost:3000";
          attachment = { kind: "image", url: new URL(`/assets/scenes/${id}.png`, base).href, alt: episode.title };
        }
        state.events.push({ type: "scene", sceneId: id });
        state.episodeId = episode.id;
        if (attachment) state.attachments.push(attachment);
        return { ok: true, episodeId: episode.id, title: episode.title, summary: episode.summary, imageAttached: hasImage };
      }
      case "show_map": {
        const id = string("location_id");
        const episode = episodes.find(e => e.locationId === id);
        if (!episode) throw new Error("Unknown location_id");
        state.events.push({ type: "map", locationId: id });
        state.episodeId ??= episode.id;
        return { ok: true };
      }
      case "switch_character": {
        const id = string("character") as CharacterId;
        if (!["athena", "odysseus", "poseidon", "circe"].includes(id) || !character(id)) throw new Error("Character data not available");
        state.character = id;
        state.events.push({ type: "character", character: id });
        return { character: character(id) };
      }
      case "end_session": {
        const takeaway = string("takeaway").trim();
        const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(takeaway)];
        if (takeaway.length > 300 || sentences.length !== 2) throw new Error("Takeaway must be two sentences, at most 300 characters; rewrite and retry end_session");
        let cardUrl: string | undefined;
        if (state.sessionId) {
          const url = new URL("/card", process.env.STAGE_URL?.trim() || "http://localhost:3000");
          const episode = episodes.find(e => e.id === state.episodeId);
          const quoteId = state.quoteId ?? episode?.keyQuotes.find(q => passages.some(p => p.id === q.passageId))?.passageId
            ?? episode?.passageIds.find(id => passages.some(p => p.id === id));
          url.searchParams.set("sessionId", state.sessionId);
          if (episode) url.searchParams.set("episode", episode.id);
          if (quoteId && passages.some(p => p.id === quoteId)) url.searchParams.set("quote", quoteId);
          url.searchParams.set("takeaway", takeaway);
          url.searchParams.set("character", state.character);
          cardUrl = url.href;
        }
        state.takeaway = takeaway;
        if (cardUrl) state.attachments.push({ kind: "image", url: cardUrl, alt: "Your Ithaca takeaway" });
        state.ended = true;
        return { ok: true, takeaway, summaryCardAvailable: !!cardUrl, ...(cardUrl ? { cardUrl } : {}) };
      }
      default: throw new Error("Unknown tool");
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Tool failed" };
  }
}
