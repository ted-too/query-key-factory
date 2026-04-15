import { q } from "../lib/q";

describe("q.createQueryKeys", () => {
  it('creates an object with only "_def" when called with the key only', () => {
    const sut = q.createQueryKeys("test");

    expect(sut).toEqual({
      _def: ["test"],
    });
  });

  it('throws an error if the schema contains a key that starts with "_"', () => {
    expect(() =>
      q.createQueryKeys("users", {
        _def: q.static({}),
        prop: q.static({}),
      })
    ).toThrow('Keys that start with "_" are reserved for Query Key Factory');

    expect(() =>
      q.createQueryKeys("users", {
        _private: q.static({}),
        prop: q.static({}),
      })
    ).toThrow('Keys that start with "_" are reserved for Query Key Factory');
  });

  it("creates static keys from q.static nodes", () => {
    const sut = q.createQueryKeys("test", {
      base: q.static({}),
      prop: q.static({
        queryKey: ["value"],
      }),
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
      filtered: q.dynamic((page: number, preview: boolean) =>
        q.static({
          queryKey: [page, { preview }],
          queryFn: () => Promise.resolve([]),
          staleTime: 1000,
        })
      ),
    });

    expect(typeof sut.filtered).toBe("function");
    expect(sut.filtered._def).toEqual(["products", "filtered"]);
    expect(sut.filtered(2, true)).toEqual({
      queryKey: ["products", "filtered", 2, { preview: true }],
      queryFn: expect.any(Function),
      staleTime: 1000,
    });
  });

  it("rejects invalid extra properties in q.static", () => {
    q.createQueryKeys("test", {
      prop: q.dynamic((value: string) =>
        q.static({
          queryKey: [value],
          // @ts-expect-error invalidKey is not a supported query option or child query
          invalidKey: true,
        })
      ),
    });
  });

  it("creates nested child queries from q.static and q.dynamic", () => {
    const sut = q.createQueryKeys("test", {
      prop: q.static({
        queryKey: null,
        nested1: q.static({}),
        nested2: q.static({
          queryKey: ["context-prop-2"],
        }),
        nested3: q.dynamic((value: string) =>
          q.static({
            queryKey: [value],
            gcTime: 3000,
            nested4: q.static({}),
          })
        ),
      }),
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
      prop: q.dynamic((value: string) =>
        q.static({
          queryKey: [value],
          nested1: q.static({}),
          nested2: q.static({
            queryKey: ["context-prop-2"],
          }),
          nested3: q.dynamic((nestedValue: string) =>
            q.static({
              queryKey: [nestedValue],
              nested4: q.static({}),
            })
          ),
        })
      ),
    });

    expect(sut).toEqual({
      _def: ["test"],
      prop: expect.any(Function),
    });

    expect(sut.prop._def).toEqual(["test", "prop"]);
    expect(sut.prop("context-props")).toEqual({
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
