import { q } from "../lib/q";

describe("infinite queries via q.static", () => {
  it("creates infinite query nodes when initialPageParam is present", () => {
    const sut = q.createQueryKeys("posts", {
      feed: q.static({
        queryFn: ({ pageParam }) =>
          Promise.resolve({
            items: [`post-${pageParam}`],
            nextCursor: pageParam + 1,
          }),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }),
    });

    expect(sut.feed).toEqual({
      queryKey: ["posts", "feed"],
      queryFn: expect.any(Function),
      initialPageParam: 0,
      getNextPageParam: expect.any(Function),
    });
  });

  it("composes a queryKey suffix when one is provided", () => {
    const sut = q.createQueryKeys("posts", {
      feed: q.static({
        queryKey: ["latest"],
        queryFn: ({ pageParam }) =>
          Promise.resolve({ items: [], nextCursor: pageParam }),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }),
    });

    expect(sut.feed).toEqual({
      queryKey: ["posts", "feed", "latest"],
      queryFn: expect.any(Function),
      initialPageParam: 0,
      getNextPageParam: expect.any(Function),
    });
  });

  it("works inside q.dynamic when wrapped with q.static for inference", () => {
    const sut = q.createQueryKeys("posts", {
      byAuthor: q.dynamic((authorId: string) =>
        q.static({
          queryKey: [authorId],
          queryFn: ({ pageParam }) =>
            Promise.resolve({
              items: [`${authorId}-${pageParam}`],
              nextCursor: pageParam + 1,
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        })
      ),
    });

    expect(typeof sut.byAuthor).toBe("function");
    expect(sut.byAuthor.queryKey).toEqual(["posts", "byAuthor"]);
    expect(sut.byAuthor("alice")).toEqual({
      queryKey: ["posts", "byAuthor", "alice"],
      queryFn: expect.any(Function),
      initialPageParam: 0,
      getNextPageParam: expect.any(Function),
    });
  });

  it("rejects invalid extra properties on infinite shapes", () => {
    q.createQueryKeys("posts", {
      // @ts-expect-error invalidKey is not a supported infinite query option
      feed: q.static({
        queryFn: ({ pageParam }) => Promise.resolve({ pageParam }),
        initialPageParam: 0,
        getNextPageParam: () => null,
        invalidKey: true,
      }),
    });
  });
});
