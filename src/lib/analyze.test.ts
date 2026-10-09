import { describe, it, expect } from "vitest";
import { demoFacts, demoAnalyze, validateFacts } from "./analyze";

export const TEST_CONVO = `Priya: I will finish the homepage design by Friday.
Arjun: I must submit the project report by Monday at 10 AM.
Meera: We decided to use Supabase for the database.
Rahul: The login page needs testing.
Priya: We will review progress on Tuesday.
Arjun: Thanks everyone!`;

const find = (cat: keyof ReturnType<typeof demoAnalyze>) => demoAnalyze(TEST_CONVO)[cat].map((i) => i.text);

describe("demo categorization", () => {
  it("finds exactly the two deadlines", () => {
    expect(find("deadlines")).toEqual([
      "I will finish the homepage design by Friday.",
      "I must submit the project report by Monday at 10 AM.",
    ]);
  });
  it("finds only the explicit decision", () => {
    expect(find("decisions")).toEqual(["We decided to use Supabase for the database."]);
  });
  it("puts the review in scheduled events, not deadlines", () => {
    expect(find("events")).toEqual(["We will review progress on Tuesday."]);
  });
  it("lists the login testing as a task", () => {
    expect(find("urgent")).toContain("The login page needs testing.");
  });
  it("has no invented mentions", () => {
    expect(find("mentions")).toEqual([]);
  });
  it("counts each statement once overall", () => {
    expect(demoFacts(TEST_CONVO + "\nArjun: I must submit the project report by Monday at 10 AM.")).toHaveLength(5);
  });
});

describe("validateFacts", () => {
  it("drops quotes not in the source and merges duplicates", () => {
    const out = validateFacts(
      [
        { quote: "The login page needs testing.", categories: ["urgent"] },
        { quote: "the login page needs testing", categories: ["deadlines"] },
        { quote: "We decided to use Firebase.", categories: ["decisions"] },
      ],
      TEST_CONVO,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.categories).toEqual(["urgent", "deadlines"]);
  });
});
