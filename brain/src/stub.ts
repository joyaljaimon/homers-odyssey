import type { TextReply, TextRequest } from "@odyssey/contracts";
import { findEpisode } from "@odyssey/story";
import { emit } from "./stage.ts";
import { runTool, type ToolState } from "./tools.ts";

// No-key integration mode: preserve canned text while using the same asset rules.
export async function handleStubText(req: TextRequest): Promise<TextReply> {
  const [episode] = findEpisode(req.message, 1);
  const state: ToolState = { sessionId: req.sessionId, character: "athena", events: [], attachments: [], ended: false };
  if (episode) {
    state.events.push({ type: "character", character: "athena" });
    runTool("show_scene", { scene_id: episode.sceneId }, state);
    runTool("show_map", { location_id: episode.locationId }, state);
  }
  const reply: TextReply = {
    character: "athena",
    text: episode
      ? `I'm an AI playing Athena. What you describe reminds me of ${episode.title}. ${episode.lessons[0]}`
      : "I'm an AI playing Athena. Tell me, traveler, what storm are you sailing through?",
    attachments: state.attachments,
    stageEvents: state.events,
    sessionEnded: false,
  };
  for (const e of reply.stageEvents) emit(req.sessionId, e);
  return reply;
}
