import { tupleKey } from "../lib/tuple-key";

describe("tupleKey", () => {
  it("returns the values as a tuple array", () => {
    expect(tupleKey("products", 1, true)).toEqual(["products", 1, true]);
  });
});
