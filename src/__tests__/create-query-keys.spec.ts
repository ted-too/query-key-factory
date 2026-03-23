import { createQueryKeys } from "../lib/create-query-keys";

describe("createQueryKeys", () => {
  describe("when called only with the key argument", () => {
    it('creates an object with only "_def" key', () => {
      const sut = createQueryKeys("test");

      expect(sut).toHaveProperty("_def");
      expect(Object.keys(sut)).toHaveLength(1);

      expect(sut).toEqual({
        _def: ["test"],
      });
    });

    it('creates the "_def" query key as an array', () => {
      const sut = createQueryKeys("test");

      expect(Array.isArray(sut._def)).toBeTruthy();
      expect(sut._def).toHaveLength(1);

      expect(sut._def).toEqual(["test"]);
    });
  });

  describe("when called with the key and the schema", () => {
    it('throws an error if the schema contains a key that starts with "_"', () => {
      expect(() =>
        createQueryKeys("users", {
          // @ts-expect-error: "_def" should not be an allowed key
          _def: ["trying to override the _def key value"],
          prop: null,
        })
      ).toThrow('Keys that start with "_" are reserved for Query Key Factory');

      expect(() =>
        createQueryKeys("users", {
          // @ts-expect-error: internal-style keys should not be allowed
          _myOwnKey: ["trying to create with the shape of an internal key"],
          prop: null,
        })
      ).toThrow('Keys that start with "_" are reserved for Query Key Factory');
    });

    it("creates static keys from null and tuples", () => {
      const sut = createQueryKeys("test", {
        base: null,
        prop: ["value"],
      });

      expect(sut).toEqual({
        _def: ["test"],
        base: {
          queryKey: ["test", "base"],
        },
        prop: {
          _def: ["test", "prop"],
          queryKey: ["test", "prop", "value"],
        },
      });
    });

    it("creates static query options with nested child queries", () => {
      const sut = createQueryKeys("test", {
        prop: {
          queryKey: ["value"],
          queryFn: () => Promise.resolve(true),
          related: null,
        },
      });

      expect(sut.prop).toEqual({
        _def: ["test", "prop"],
        related: {
          queryKey: ["test", "prop", "value", "related"],
        },
        queryKey: ["test", "prop", "value"],
        queryFn: expect.any(Function),
      });
    });

    it("creates callbacks for dynamic keys", () => {
      const sut = createQueryKeys("test", {
        prop: (value: string) => [value],
      });

      expect(typeof sut.prop).toBe("function");
      expect(sut.prop._def).toEqual(["test", "prop"]);
      expect(sut.prop("value")).toEqual({
        queryKey: ["test", "prop", "value"],
      });
    });

    it("drops invalid extra properties from dynamic factories", () => {
      const sut = createQueryKeys("test", {
        // @ts-expect-error prop return is invalid as staleTime is an invalidKey
        prop: (value: string) => ({
          queryKey: [value],
          staleTime: Number.POSITIVE_INFINITY,
        }),
      });

      expect(sut.prop("value")).toEqual({
        queryKey: ["test", "prop", "value"],
      });
    });

    it("creates dynamic query options with nested child queries", () => {
      const sut = createQueryKeys("test", {
        prop: (value: string) => ({
          queryKey: [value],
          queryFn: () => Promise.resolve(true),
          related: null,
        }),
      });

      expect(sut.prop("value")).toEqual({
        related: {
          queryKey: ["test", "prop", "value", "related"],
        },
        queryKey: ["test", "prop", "value"],
        queryFn: expect.any(Function),
      });
    });
  });
});

describe("createQueryKeys nested child queries", () => {
  describe("when setting as a static key", () => {
    it("returns the expected types and shape", () => {
      const sut = createQueryKeys("test", {
        prop: {
          queryKey: null,
          nested1: null,
          nested2: ["context-prop-2"],
          nested3: (value: string) => ({
            queryKey: [value],
            nested4: null,
          }),
        },
      });

      expect(sut).toEqual({
        _def: ["test"],
        prop: {
          queryKey: ["test", "prop"],
          nested1: {
            queryKey: ["test", "prop", "nested1"],
          },
          nested2: {
            _def: ["test", "prop", "nested2"],
            queryKey: ["test", "prop", "nested2", "context-prop-2"],
          },
          nested3: expect.any(Function),
        },
      });

      expect(sut.prop.nested3._def).toEqual(["test", "prop", "nested3"]);

      const result = sut.prop.nested3("context-prop-3");
      expect(result).toEqual({
        queryKey: ["test", "prop", "nested3", "context-prop-3"],
        nested4: {
          queryKey: ["test", "prop", "nested3", "context-prop-3", "nested4"],
        },
      });
    });
  });

  describe("when setting as a dynamic key", () => {
    it("returns the expected types and shape", () => {
      const sut = createQueryKeys("test", {
        prop: (value: string) => ({
          queryKey: [value],
          nested1: null,
          nested2: ["context-prop-2"],
          nested3: (nestedValue: string) => ({
            queryKey: [nestedValue],
            nested4: null,
          }),
        }),
      });

      expect(sut).toEqual({
        _def: ["test"],
        prop: expect.any(Function),
      });

      expect(sut.prop._def).toEqual(["test", "prop"]);

      const result = sut.prop("context-props");
      expect(result).toEqual({
        queryKey: ["test", "prop", "context-props"],
        nested1: {
          queryKey: ["test", "prop", "context-props", "nested1"],
        },
        nested2: {
          _def: ["test", "prop", "context-props", "nested2"],
          queryKey: [
            "test",
            "prop",
            "context-props",
            "nested2",
            "context-prop-2",
          ],
        },
        nested3: expect.any(Function),
      });
    });
  });
});
