import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { vi } from "vitest";
import { q } from "../lib/q";

type QueryFnLike = (context: {
  client: QueryClient;
  queryKey: readonly unknown[];
  signal: AbortSignal;
  meta: undefined;
}) => unknown;

const runNodeQueryFn = (
  client: QueryClient,
  node: { queryKey: readonly unknown[]; queryFn?: unknown }
) =>
  (node.queryFn as QueryFnLike)({
    client,
    queryKey: node.queryKey,
    signal: new AbortController().signal,
    meta: undefined,
  });

describe("dependsOn", () => {
  it("loads a referenced dependency and passes its data to the queryFn", async () => {
    const reference = q.createQueryKeys("reference", {
      countries: q.static({
        queryFn: () => Promise.resolve(["US", "GB"]),
      }),
    });

    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: {
          countries: reference.countries,
        },
        queryFn: (_context, { countries }) =>
          Promise.resolve({ authenticated: true, countries }),
        staleTime: 60_000,
      }),
    });

    const client = new QueryClient();
    const result = await runNodeQueryFn(client, session.me);

    expect(result).toEqual({ authenticated: true, countries: ["US", "GB"] });
    expect(client.getQueryData(["reference", "countries"])).toEqual([
      "US",
      "GB",
    ]);
  });

  it("exposes the resolved `dependsOn` map on the node for invalidation", () => {
    const reference = q.createQueryKeys("reference", {
      countries: q.static({ queryFn: () => Promise.resolve([]) }),
    });

    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: {
          countries: reference.countries,
          languages: q.static({ queryFn: () => Promise.resolve([]) }),
        },
        queryFn: () => Promise.resolve(null),
      }),
    });

    expect(session.me.dependsOn.countries.queryKey).toEqual([
      "reference",
      "countries",
    ]);
    expect(session.me.dependsOn.languages.queryKey).toEqual([
      "session",
      "me",
      "languages",
    ]);
    expect(session.me.queryKey).toEqual(["session", "me"]);
    expect(session.me.queryFn).toEqual(expect.any(Function));
  });

  it("loads multiple dependencies in parallel", async () => {
    const order: string[] = [];
    const reference = q.createQueryKeys("reference", {
      countries: q.static({
        queryFn: async () => {
          order.push("countries:start");
          await Promise.resolve();
          order.push("countries:end");
          return ["US"];
        },
      }),
      currencies: q.static({
        queryFn: async () => {
          order.push("currencies:start");
          await Promise.resolve();
          order.push("currencies:end");
          return ["USD"];
        },
      }),
    });

    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: {
          countries: reference.countries,
          currencies: reference.currencies,
        },
        queryFn: (_context, deps) => Promise.resolve(deps),
      }),
    });

    const client = new QueryClient();
    const result = await runNodeQueryFn(client, session.me);

    expect(result).toEqual({ countries: ["US"], currencies: ["USD"] });
    expect(order.slice(0, 2)).toEqual(["countries:start", "currencies:start"]);
  });

  it("reuses cached dependency data instead of refetching", async () => {
    let calls = 0;
    const reference = q.createQueryKeys("reference", {
      countries: q.static({
        queryFn: () => {
          calls += 1;
          return Promise.resolve(["US"]);
        },
      }),
    });

    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: { countries: reference.countries },
        queryFn: (_context, { countries }) => Promise.resolve(countries),
      }),
    });

    const client = new QueryClient();
    await client.ensureQueryData(reference.countries);
    await runNodeQueryFn(client, session.me);

    expect(calls).toBe(1);
  });

  it("supports inline dependency definitions with a derived cache key", async () => {
    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: {
          countries: q.static({
            queryFn: () => Promise.resolve(["US", "GB"]),
          }),
        },
        queryFn: (_context, { countries }) => Promise.resolve({ countries }),
      }),
    });

    const client = new QueryClient();
    const result = await runNodeQueryFn(client, session.me);

    expect(result).toEqual({ countries: ["US", "GB"] });
    expect(client.getQueryData(["session", "me", "countries"])).toEqual([
      "US",
      "GB",
    ]);
  });

  it("rejects when a dependency rejects", async () => {
    const reference = q.createQueryKeys("reference", {
      countries: q.static({
        queryFn: () => Promise.reject(new Error("boom")),
      }),
    });

    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: { countries: reference.countries },
        queryFn: (_context, { countries }) => Promise.resolve(countries),
      }),
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await expect(runNodeQueryFn(client, session.me)).rejects.toThrow("boom");
  });

  it("refetches a dependent when its dependency commits new data", async () => {
    const reference = q.createQueryKeys("reference", {
      countries: q.static({
        queryFn: () => Promise.resolve(["US"]),
      }),
    });

    let runs = 0;
    const session = q.createQueryKeys("session", {
      me: q.static({
        dependsOn: { countries: reference.countries },
        queryFn: (_context, { countries }) => {
          runs += 1;
          return Promise.resolve({ countries });
        },
      }),
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const observer = new QueryObserver(client, session.me as never);
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual({ countries: ["US"] })
    );
    expect(runs).toBe(1);

    client.setQueryData(["reference", "countries"], ["US", "GB"]);

    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual({
        countries: ["US", "GB"],
      })
    );
    expect(runs).toBe(2);

    unsubscribe();
  });

  it("types and resolves a dynamic dependent against its argument", async () => {
    const users = q.createQueryKeys("users", {
      detail: q.dynamic((userId: string) => ({
        queryKey: [userId],
        queryFn: () => Promise.resolve({ id: userId, name: "Ada" }),
      })),
    });

    const posts = q.createQueryKeys("posts", {
      byAuthor: q.dynamic((userId: string) =>
        q.static({
          queryKey: [userId],
          dependsOn: { author: users.detail(userId) },
          queryFn: (_context, { author }) =>
            Promise.resolve({ author: author.name, posts: [] as string[] }),
        })
      ),
    });

    const client = new QueryClient();
    const node = posts.byAuthor("user_1");

    expect(node.queryKey).toEqual(["posts", "byAuthor", "user_1"]);
    expect(node.dependsOn.author.queryKey).toEqual([
      "users",
      "detail",
      "user_1",
    ]);

    const result = await runNodeQueryFn(client, node);
    expect(result).toEqual({ author: "Ada", posts: [] });
  });
});
