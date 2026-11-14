import { readFileSync } from "node:fs";
import type { FunctionDeclaration } from "@google/genai";
import { getCharacter } from "@odyssey/story";
import type { CharacterId } from "@odyssey/contracts";

const athena = readFileSync(new URL("./personas/athena.md", import.meta.url), "utf8");
export const declarations = JSON.parse(readFileSync(new URL("../../contracts/tools.json", import.meta.url), "utf8")).tools
  .map(({ name, description, parameters }: { name: string; description: string; parameters: object }) =>
    ({ name, description, parametersJsonSchema: parameters })) as FunctionDeclaration[];

export function systemPrompt(character: CharacterId) {
  return `${athena}\nCurrent character guide: ${JSON.stringify(getCharacter(character))}`;
}

// Provisional until listening tests with Role 4 and Role 3's character-data handoff.
export const voices: Record<CharacterId, string> = {
  athena: "Kore", odysseus: "Charon", poseidon: "Fenrir", circe: "Aoede",
};
