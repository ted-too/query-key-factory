import { q } from "../lib/q";

describe("q.createQueryKeys", () => {
  it('creates an object with only "queryKey" when called with the key only', () => {
    const sut = q.createQueryKeys("test");

    expect(sut).toEqual({
      queryKey: ["test"],
    });
  });

  it('throws an error if the schema contains a key that starts with "_"', () => {
    expect(() =>
      q.createQueryKeys("users", {
        _def: q.static({ queryKey: null }),
        prop: q.static({ queryKey: null }),
      })
    ).toThrow('Keys that start with "_" are reserved for Query Key Factory');

    expect(() =>
      q.createQueryKeys("users", {
        _private: q.static({ queryKey: null }),
        prop: q.static({ queryKey: null }),
      })
    ).toThrow('Keys that start with "_" are reserved for Query Key Factory');
  });

  it("creates static keys from q.static nodes", () => {
    const sut = q.createQueryKeys("test", {
      base: q.static({ queryKey: null }),
      prop: q.static({
        queryKey: ["value"],
      }),
    });

    expect(sut).toEqual({
      queryKey: ["test"],
      base: {
        queryKey: ["test", "base"],
      },
      prop: {
        queryKey: ["test", "prop", "value"],
      },
    });
  });

  it("preserves query options on static nodes", () => {
    const sut = q.createQueryKeys("session", {
      me: q.static({
        queryFn: () => Promise.resolve({ userId: "user_1" }),
        staleTime: 60_000,
        gcTime: 300_000,
        meta: {
          scope: "session",
        },
      }),
    });

    expect(sut.me).toEqual({
      queryKey: ["session", "me"],
      queryFn: expect.any(Function),
      staleTime: 60_000,
      gcTime: 300_000,
      meta: {
        scope: "session",
      },
    });
  });

  it("creates dynamic keys from q.dynamic nodes", () => {
    const sut = q.createQueryKeys("products", {
      filtered: q.dynamic((page: number, preview: boolean) => ({
        queryKey: [page, { preview }],
        queryFn: () => Promise.resolve([]),
        staleTime: 1000,
      })),
    });

    expect(typeof sut.filtered).toBe("function");
    expect(sut.filtered.queryKey).toEqual(["products", "filtered"]);
    expect(sut.filtered(2, true)).toEqual({
      queryKey: ["products", "filtered", 2, { preview: true }],
      queryFn: expect.any(Function),
      staleTime: 1000,
    });
  });

  it("rejects invalid extra properties when q.dynamic wraps q.static", () => {
    // The plain-object form of q.dynamic prioritises ergonomic contextual
    // inference over strict excess-key validation. To catch typos and invalid
    // option keys, wrap the body with q.static, which validates extras
    // against the full ContextualQueryOptions shape.
    q.createQueryKeys("test", {
      prop: q.dynamic((value: string) =>
        // @ts-expect-error invalidKey is not a supported query option or child query
        q.static({
          queryKey: [value],
          invalidKey: true,
        })
      ),
    });
  });

  it("creates nested child queries from q.static and q.dynamic", () => {
    const sut = q.createQueryKeys("test", {
      prop: q.static({
        queryKey: null,
        nested1: q.static({ queryKey: null }),
        nested2: q.static({
          queryKey: ["context-prop-2"],
        }),
        nested3: q.dynamic((value: string) => ({
          queryKey: [value],
          gcTime: 3000,
          nested4: q.static({ queryKey: null }),
        })),
      }),
    });

    expect(sut).toEqual({
      queryKey: ["test"],
      prop: {
        queryKey: ["test", "prop"],
        nested1: {
          queryKey: ["test", "prop", "nested1"],
        },
        nested2: {
          queryKey: ["test", "prop", "nested2", "context-prop-2"],
        },
        nested3: expect.any(Function),
      },
    });

    expect(sut.prop.nested3.queryKey).toEqual(["test", "prop", "nested3"]);
    expect(sut.prop.nested3("context-prop-3")).toEqual({
      queryKey: ["test", "prop", "nested3", "context-prop-3"],
      gcTime: 3000,
      nested4: {
        queryKey: ["test", "prop", "nested3", "context-prop-3", "nested4"],
      },
    });
  });

  it("supports nested child queries under dynamic parents", () => {
    const sut = q.createQueryKeys("test", {
      prop: q.dynamic((value: string) => ({
        queryKey: [value],
        nested1: q.static({ queryKey: null }),
        nested2: q.static({
          queryKey: ["context-prop-2"],
        }),
        nested3: q.dynamic((nestedValue: string) => ({
          queryKey: [nestedValue],
          nested4: q.static({ queryKey: null }),
        })),
      })),
    });

    expect(sut).toEqual({
      queryKey: ["test"],
      prop: expect.any(Function),
    });

    expect(sut.prop.queryKey).toEqual(["test", "prop"]);
    expect(sut.prop("context-props")).toEqual({
      queryKey: ["test", "prop", "context-props"],
      nested1: {
        queryKey: ["test", "prop", "context-props", "nested1"],
      },
      nested2: {
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
