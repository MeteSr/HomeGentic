import { rebateFinderPrompt, rebateFinderInputError } from "../src/rebateFinder";

describe("rebate finder prompt", () => {
  const prompt = rebateFinderPrompt();

  it("no longer asks for federal tax credits", () => {
    expect(prompt).not.toMatch(/IRA tax credits/i);
    expect(prompt).toMatch(/do not list federal tax credits/i);
  });

  it("tells the model to leave out programs it isn't sure are still offered", () => {
    expect(prompt).toMatch(/not sure .* still offered/i);
  });

  it("keeps the JSON shape the frontend reads", () => {
    for (const field of ["rebates", "name", "description", "estimatedAmount", "provider", "url"]) {
      expect(prompt).toContain(`"${field}"`);
    }
  });
});

describe("rebate finder input", () => {
  const ok = { state: "FL", zipCode: "32114", utilityProvider: "FPL", billType: "Electric" };

  it("accepts a two-letter state and a 5-digit zip", () => {
    expect(rebateFinderInputError(ok)).toBeNull();
    expect(rebateFinderInputError({ ...ok, zipCode: "32114-1234" })).toBeNull();
  });

  it.each([
    [{ ...ok, state: "" }, /required/],
    [{ ...ok, utilityProvider: undefined }, /required/],
    [{ ...ok, state: "Florida" }, /two-letter/],
    [{ ...ok, zipCode: "321" }, /zip/i],
    [{ ...ok, billType: "Water" }, /only available for Electric/],
    [{ ...ok, utilityProvider: "x".repeat(121) }, /too long/],
  ])("rejects %o", (body, msg) => {
    expect(rebateFinderInputError(body as any)).toMatch(msg);
  });
});
