import { readFileSync } from "node:fs";
import type { FunctionDeclaration } from "@google/genai";
import { getCharacter } from "@odyssey/story";
import type { Character, CharacterId } from "@odyssey/contracts";

const common = readFileSync(new URL("./personas/common.md", import.meta.url), "utf8");
const personas = Object.fromEntries(["athena", "odysseus", "poseidon", "circe"].map(id =>
  [id, readFileSync(new URL(`./personas/${id}.md`, import.meta.url), "utf8")])) as Record<CharacterId, string>;
export const declarations = JSON.parse(readFileSync(new URL("../../contracts/tools.json", import.meta.url), "utf8")).tools
  .map(({ name, description, parameters }: { name: string; description: string; parameters: object }) =>
    ({ name, description, parametersJsonSchema: parameters })) as FunctionDeclaration[];

export function systemPrompt(character: CharacterId, guide: Character | undefined = getCharacter(character)) {
  return `${common}\n${personas[character]}\nCurrent character guide: ${JSON.stringify(guide)}`;
}

// Provisional until listening tests with Role 4 and Role 3's character-data handoff.
export const voices: Record<CharacterId, string> = {
  athena: "Kore", odysseus: "Charon", poseidon: "Fenrir", circe: "Aoede",
};

export function characterVoice(character: CharacterId, guide: Character | undefined = getCharacter(character)) {
  return guide?.voice && !guide.voice.startsWith("TODO") ? guide.voice : voices[character];
}
