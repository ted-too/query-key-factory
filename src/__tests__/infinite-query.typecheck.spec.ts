import { useInfiniteQuery } from "@tanstack/react-query";
import { expectTypeOf, test } from "vitest";
import { q } from "../lib/q";

test("q.static infers infinite typing when initialPageParam is present", () => {
  const sut = q.createQueryKeys("posts", {
    feed: q.static({
      queryFn: ({ pageParam, signal }) => {
        expectTypeOf(pageParam).toEqualTypeOf<number>();
        expectTypeOf(signal).not.toBeAny();
        expectTypeOf(signal).toExtend<AbortSignal | undefined>();
        return Promise.resolve({
          items: [`post-${pageParam}`],
          nextCursor: pageParam + 1,
        });
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages, lastPageParam) => {
        expectTypeOf(lastPage).toEqualTypeOf<{
          items: string[];
          nextCursor: number;
        }>();
        expectTypeOf(allPages).toEqualTypeOf<
          { items: string[]; nextCursor: number }[]
        >();
        expectTypeOf(lastPageParam).toEqualTypeOf<number>();
        return lastPage.nextCursor;
      },
    }),
  });

  expectTypeOf(sut.feed.queryKey).toEqualTypeOf<readonly ["posts", "feed"]>();
  expectTypeOf(sut.feed.initialPageParam).toEqualTypeOf<number>();
});

test("infinite q.static supports an explicit queryKey suffix", () => {
  const sut = q.createQueryKeys("posts", {
    feed: q.static({
      queryKey: ["latest"],
      queryFn: ({ pageParam }) =>
        Promise.resolve({ items: [] as string[], nextCursor: pageParam + 1 }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  });

  expectTypeOf(sut.feed.queryKey).toEqualTypeOf<
    readonly ["posts", "feed", "latest"]
  >();
});

test("q.dynamic infinite via q.static wrap preserves inference", () => {
  const sut = q.createQueryKeys("posts", {
    byAuthor: q.dynamic((authorId: string) =>
      q.static({
        queryKey: [authorId],
        queryFn: ({ pageParam }) => {
          expectTypeOf(pageParam).toEqualTypeOf<number>();
          return Promise.resolve({
            items: [`${authorId}-${pageParam}`],
            nextCursor: pageParam + 1,
          });
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
          expectTypeOf(lastPage).toEqualTypeOf<{
            items: string[];
            nextCursor: number;
          }>();
          return lastPage.nextCursor;
        },
      })
    ),
  });

  const node = sut.byAuthor("alice");
  expectTypeOf(node.queryKey).toEqualTypeOf<
    readonly ["posts", "byAuthor", string]
  >();
  expectTypeOf(node.initialPageParam).toEqualTypeOf<number>();
});

test("infinite node drives useInfiniteQuery with correct page-param typing", () => {
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

  type Result = ReturnType<typeof _buildResult>;
  const _buildResult = () => useInfiniteQuery(sut.feed);

  expectTypeOf<Result["data"]>().toExtend<
    | {
        pages: { items: string[]; nextCursor: number }[];
        pageParams: number[];
      }
    | undefined
  >();
});

test("dynamic + q.static-wrapped infinite drives useInfiniteQuery", () => {
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

  type Result = ReturnType<typeof _buildResult>;
  const _buildResult = () => useInfiniteQuery(sut.byAuthor("alice"));

  expectTypeOf<Result["data"]>().toExtend<
    | {
        pages: { items: string[]; nextCursor: number }[];
        pageParams: number[];
      }
    | undefined
  >();
});
