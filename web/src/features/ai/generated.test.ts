import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generatedDraftSchema, generatedToDraftParts } from "./generated";

const fixturesDir = join(__dirname, "../../../../shared/fixtures/generated");
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".json"))
  .map((name) => ({ name, data: JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as unknown }));

describe("generated draft contract (shared with the companion)", () => {
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(3));

  for (const { name, data } of fixtures) {
    const shouldPass = name.startsWith("valid_");
    it(`${shouldPass ? "accepts" : "rejects"} ${name}`, () => {
      expect(generatedDraftSchema.safeParse(data).success).toBe(shouldPass);
    });
  }

  it("maps correct indices to stable option ids", () => {
    const quiz = fixtures.find((f) => f.name === "valid_quiz.json")!;
    const parts = generatedToDraftParts(generatedDraftSchema.parse(quiz.data));
    const multi = parts.questions[1]!;
    expect(multi.options.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(multi.correctOptionIds).toEqual(["a", "b"]);
    expect(parts.questions[2]!.correctBool).toBe(true);
    expect(parts.questions[3]!.acceptedAnswers).toEqual(["хлорофил"]);
    expect(parts.questions.every((q) => q.id === null)).toBe(true);
  });
});
