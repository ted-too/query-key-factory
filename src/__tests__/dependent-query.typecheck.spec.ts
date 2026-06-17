import type { UseQueryOptions } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";
import { expectTypeOf, test } from "vitest";
import { q } from "../lib/q";

const reference = q.createQueryKeys("reference", {
  countries: q.static({
    queryFn: () => Promise.resolve(["US", "GB"] as string[]),
  }),
});

test("dependsOn injects resolved dependency data as the second queryFn arg", () => {
  q.createQueryKeys("session", {
    me: q.static({
      dependsOn: {
        countries: reference.countries,
      },
      queryFn: (context, dependencies) => {
        expectTypeOf(context.signal).toExtend<AbortSignal | undefined>();
        expectTypeOf(context.client).not.toBeAny();
        expectTypeOf(dependencies.countries).toEqualTypeOf<string[]>();
        return Promise.resolve({ authenticated: true as boolean });
      },
      staleTime: 60_000,
    }),
  });
});

test("inline dependency definitions are typed from their own queryFn", () => {
  q.createQueryKeys("session", {
    me: q.static({
      dependsOn: {
        countries: q.static({
          queryFn: () => Promise.resolve([1, 2, 3]),
        }),
      },
      queryFn: (_context, dependencies) => {
        expectTypeOf(dependencies.countries).toEqualTypeOf<number[]>();
        return Promise.resolve(null);
      },
    }),
  });
});

test("a dependent node resolves to standard useQuery options", () => {
  const session = q.createQueryKeys("session", {
    me: q.static({
      dependsOn: {
        countries: reference.countries,
      },
      queryFn: (_context, { countries }) =>
        Promise.resolve({ count: countries.length }),
      staleTime: 60_000,
    }),
  });

  expectTypeOf(session.me.queryKey).toEqualTypeOf<readonly ["session", "me"]>();
  expectTypeOf(session.me).toExtend<
    UseQueryOptions<
      { count: number },
      Error,
      { count: number },
      readonly ["session", "me"]
    >
  >();
});

test("a dependent node exposes its resolved dependsOn map for invalidation", () => {
  const session = q.createQueryKeys("session", {
    me: q.static({
      dependsOn: {
        countries: reference.countries,
        languages: q.static({ queryFn: () => Promise.resolve(["en"]) }),
      },
      queryFn: () => Promise.resolve(null),
    }),
  });

  expectTypeOf(session.me.dependsOn.countries.queryKey).toEqualTypeOf<
    readonly ["reference", "countries"]
  >();
  expectTypeOf(session.me.dependsOn.languages.queryKey).toEqualTypeOf<
    readonly ["session", "me", "languages"]
  >();
});

test("multiple dependencies are each individually typed", () => {
  const ref = q.createQueryKeys("reference", {
    countries: q.static({ queryFn: () => Promise.resolve(["US"]) }),
    currency: q.static({ queryFn: () => Promise.resolve(42) }),
  });

  q.createQueryKeys("session", {
    me: q.static({
      dependsOn: {
        countries: ref.countries,
        currency: ref.currency,
      },
      queryFn: (_context, dependencies) => {
        expectTypeOf(dependencies.countries).toEqualTypeOf<string[]>();
        expectTypeOf(dependencies.currency).toEqualTypeOf<number>();
        return Promise.resolve(null);
      },
    }),
  });
});

test("dynamic dependents type their argument and their dependencies", () => {
  const users = q.createQueryKeys("users", {
    detail: q.dynamic((userId: string) => ({
      queryKey: [userId],
      queryFn: () => Promise.resolve({ id: userId, name: "Ada" }),
    })),
  });

  const posts = q.createQueryKeys("posts", {
    byAuthor: q.dynamic((userId: string) => ({
      queryKey: [userId],
      dependsOn: { author: users.detail(userId) },
      staleTime: 60_000,
      queryFn: (_context, dependencies) => {
        expectTypeOf(dependencies.author).toEqualTypeOf<{
          id: string;
          name: string;
        }>();
        return Promise.resolve({ author: dependencies.author.name });
      },
    })),
  });

  const node = posts.byAuthor("user_1");
  expectTypeOf(node.queryKey).toEqualTypeOf<
    readonly ["posts", "byAuthor", string]
  >();
  expectTypeOf(node.dependsOn.author.queryKey).toEqualTypeOf<
    readonly ["users", "detail", string]
  >();
});

test("dynamic infinite dependents infer pages and dependencies inline", () => {
  const settings = q.createQueryKeys("settings", {
    feed: q.static({ queryFn: () => Promise.resolve({ pageSize: 20 }) }),
  });

  const feeds = q.createQueryKeys("feeds", {
    byTopic: q.dynamic((topic: string) => ({
      queryKey: [topic],
      dependsOn: { settings: settings.feed },
      initialPageParam: 0,
      queryFn: (context, dependencies) => {
        expectTypeOf(dependencies.settings).toEqualTypeOf<{
          pageSize: number;
        }>();
        return Promise.resolve({
          items: [] as string[],
          nextCursor: (context.pageParam as number) + 1,
        });
      },
      getNextPageParam: (lastPage) => {
        expectTypeOf(lastPage).toEqualTypeOf<{
          items: string[];
          nextCursor: number;
        }>();
        return lastPage.nextCursor;
      },
    })),
  });

  const node = feeds.byTopic("typescript");
  expectTypeOf(node.queryKey).toEqualTypeOf<
    readonly ["feeds", "byTopic", string]
  >();
  expectTypeOf(node.dependsOn.settings.queryKey).toEqualTypeOf<
    readonly ["settings", "feed"]
  >();
});

test("an infinite dependent resolves to standard useInfiniteQuery options", () => {
  const settings = q.createQueryKeys("settings", {
    feed: q.static({ queryFn: () => Promise.resolve({ pageSize: 20 }) }),
  });

  interface Page {
    items: string[];
    nextCursor: number;
  }

  const posts = q.createQueryKeys("posts", {
    feed: q.static({
      dependsOn: { settings: settings.feed },
      initialPageParam: 0,
      queryFn: (context, dependencies) => {
        expectTypeOf(context.pageParam).toEqualTypeOf<number>();
        expectTypeOf(dependencies.settings).toEqualTypeOf<{
          pageSize: number;
        }>();
        return Promise.resolve({ items: [] as string[], nextCursor: 1 });
      },
      getNextPageParam: (lastPage) => {
        expectTypeOf(lastPage).toEqualTypeOf<Page>();
        return lastPage.nextCursor;
      },
    }),
  });

  expectTypeOf(posts.feed.queryKey).toEqualTypeOf<readonly ["posts", "feed"]>();
  expectTypeOf(posts.feed.dependsOn.settings.queryKey).toEqualTypeOf<
    readonly ["settings", "feed"]
  >();

  type Result = ReturnType<typeof _buildResult>;
  const _buildResult = () => useInfiniteQuery(posts.feed);

  expectTypeOf<Result["data"]>().toExtend<
    { pages: Page[]; pageParams: number[] } | undefined
  >();
});
