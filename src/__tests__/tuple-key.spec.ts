import { tupleKey } from "../lib/tuple-key";

describe("tupleKey", () => {
  it("returns the values as a tuple array", () => {
    expect(tupleKey("products", 1, true)).toEqual(["products", 1, true]);
  });

  it("preserves order of mixed primitive arguments", () => {
    expect(tupleKey(0, "a", false, undefined)).toEqual([
      0,
      "a",
      false,
      undefined,
    ]);
  });

  it("keeps object arguments by reference", () => {
    const filters = { preview: true, status: "completed" as const };
    const result = tupleKey("todos", filters);
    expect(result).toEqual(["todos", filters]);
    expect(result[1]).toBe(filters);
  });

  it("does not mutate or freeze the returned array (caller may inspect freely)", () => {
    const result = tupleKey("a", 1);
    expect(Array.isArray(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(false);
  });
});
