import { readFileSync } from "node:fs";
import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import type { CharacterId, TextReply, TextRequest } from "@odyssey/contracts";
import { getCharacter } from "@odyssey/story";
import { emit } from "./stage.ts";
import { handleStubText } from "./stub.ts";
import { runTool, type ToolState } from "./tools.ts";

const persona = readFileSync(new URL("./personas/athena.md", import.meta.url), "utf8");
const declarations = JSON.parse(readFileSync(new URL("../../contracts/tools.json", import.meta.url), "utf8")).tools
  .map(({ name, description, parameters }: { name: string; description: string; parameters: object }) =>
    ({ name, description, parametersJsonSchema: parameters })) as FunctionDeclaration[];

type Session = { contents: Content[]; character: CharacterId; updated: number };
type Generate = (request: GenerateContentParameters) => Promise<GenerateContentResponse>;
const TTL = 30 * 60 * 1000;
const MAX_SESSIONS = 200;

// Injectable generation keeps tool and memory tests offline; production uses the SDK.
export function createTextHandler(generate: Generate, publish = emit) {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, Promise<unknown>>();

  async function turn(req: TextRequest): Promise<TextReply> {
    const now = Date.now();
    for (const [id, session] of sessions) if (now - session.updated > TTL) sessions.delete(id);
    const previous = sessions.get(req.sessionId);
    if (!previous && sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
    const contents: Content[] = [...(previous?.contents ?? []), { role: "user", parts: [{ text: req.message }] }];
    const state: ToolState = { character: previous?.character ?? "athena", events: [], attachments: [], ended: false };
    if (!previous) state.events.push({ type: "character", character: state.character });
    let text = "";
    for (let round = 0; round < 8; round++) {
      const response = await generate({
        model: process.env.GEMINI_TEXT_MODEL || "gemini-flash-latest",
        contents,
        config: {
          systemInstruction: `${persona}\nCurrent character guide: ${JSON.stringify(getCharacter(state.character))}\n${previous ? "This is a continuing conversation." : "This is your first reply; disclose that you are an AI."}`,
          tools: [{ functionDeclarations: declarations }],
          httpOptions: { timeout: 30_000 },
        },
      });
      // Preserve complete model parts, including thought signatures needed on tool turns.
      const content = response.candidates?.[0]?.content;
      if (!content?.parts?.length) throw new Error("Gemini returned no content");
      contents.push(content);
      const calls = response.functionCalls ?? [];
      if (!calls.length) {
        text = content.parts.filter(p => !p.thought).map(p => p.text ?? "").join("").trim();
        break;
      }
      const results: Part[] = calls.map(call => ({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: runTool(call.name ?? "", call.args ?? {}, state),
        },
      }));
      contents.push({ role: "user", parts: results });
      if (state.ended) {
        text = state.takeaway!;
        break;
      }
    }
    if (!text) throw new Error("Gemini did not finish within the tool-call limit");
    if (!previous && !/\bAI\b/i.test(text)) text = `I'm an AI playing ${getCharacter(state.character)?.name ?? "Athena"}. ${text}`;
    // Store complete turns only. Failed requests leave history and stage unchanged.
    if (state.ended) sessions.delete(req.sessionId);
    else sessions.set(req.sessionId, { character: state.character, contents: [...contents], updated: Date.now() });
    // Bound history at a user-turn boundary, preserving tool call/response pairs.
    const saved = sessions.get(req.sessionId);
    if (saved && saved.contents.length > 80) {
      const boundary = saved.contents.findIndex((c, i) => i >= saved.contents.length - 60 && c.role === "user" && c.parts?.some(p => p.text));
      if (boundary > 0) saved.contents = saved.contents.slice(boundary);
    }
    for (const event of state.events) publish(req.sessionId, event);
    return { character: state.character, text, attachments: state.attachments, stageEvents: state.events, sessionEnded: state.ended };
  }

  return function handle(req: TextRequest): Promise<TextReply> {
    if (!req || typeof req.sessionId !== "string" || !req.sessionId.trim() || req.sessionId.length > 200 ||
        typeof req.message !== "string" || !req.message.trim() || req.message.length > 16_000 ||
        typeof req.from !== "string" || !["imessage", "sms"].includes(req.channel)) {
      return Promise.reject(new Error("Invalid TextRequest"));
    }
    // Concurrent messages for one caller cannot overwrite each other's history.
    const job = (pending.get(req.sessionId) ?? Promise.resolve()).catch(() => {}).then(() => turn(req));
    pending.set(req.sessionId, job);
    void job.finally(() => { if (pending.get(req.sessionId) === job) pending.delete(req.sessionId); }).catch(() => {});
    return job;
  };
}

let liveHandler: ReturnType<typeof createTextHandler> | undefined;
export async function handleText(req: TextRequest): Promise<TextReply> {
  if (!process.env.GEMINI_API_KEY?.trim()) return handleStubText(req);
  if (!liveHandler) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    liveHandler = createTextHandler(request => ai.models.generateContent(request));
  }
  return liveHandler(req);
}
