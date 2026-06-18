import type { UseQueryOptions } from "@tanstack/react-query";
import { expectTypeOf, test } from "vitest";
import { q } from "../lib/q";

test("q.static queryFn infers a TanStack QueryFunctionContext", () => {
  const sut = q.createQueryKeys("session", {
    me: q.static({
      queryFn: ({ signal, meta }) => {
        expectTypeOf(signal).not.toBeAny();
        expectTypeOf(signal).toExtend<AbortSignal | undefined>();
        expectTypeOf(meta).toExtend<Record<string, unknown> | undefined>();
        return Promise.resolve({ authenticated: true as boolean });
      },
    }),
  });

  expectTypeOf(sut.me.queryKey).toEqualTypeOf<readonly ["session", "me"]>();
});

test("q.static supports an explicit queryKey suffix", () => {
  const sut = q.createQueryKeys("session", {
    me: q.static({
      queryKey: ["another-param"],
      queryFn: ({ signal }) => {
        expectTypeOf(signal).not.toBeAny();
        expectTypeOf(signal).toExtend<AbortSignal | undefined>();
        return Promise.resolve({ authenticated: true as boolean });
      },
    }),
  });

  expectTypeOf(sut.me.queryKey).toEqualTypeOf<
    readonly ["session", "me", "another-param"]
  >();
});

test("q.dynamic returns nodes whose queryFn keep TanStack context typing", () => {
  q.createQueryKeys("products", {
    detail: q.dynamic((sku: string) => ({
      queryKey: [sku],
      queryFn: ({ signal, meta }) => {
        expectTypeOf(signal).not.toBeAny();
        expectTypeOf(signal).toExtend<AbortSignal | undefined>();
        expectTypeOf(meta).toExtend<Record<string, unknown> | undefined>();
        return Promise.resolve({ sku, price: 100 });
      },
    })),
  });
});

test("the README session example types are usable with useQuery", () => {
  const session = q.createQueryKeys("session", {
    me: q.static({
      queryFn: ({ signal }) => {
        expectTypeOf(signal).not.toBeAny();
        expectTypeOf(signal).toExtend<AbortSignal | undefined>();
        if (signal?.aborted) {
          return Promise.reject(new Error("aborted"));
        }
        return Promise.resolve({ authenticated: true as boolean });
      },
      staleTime: 60_000,
      organizationBySlug: q.dynamic((organizationSlug: string) => ({
        queryKey: ["organization", organizationSlug],
        queryFn: ({ signal }) => {
          expectTypeOf(signal).not.toBeAny();
          expectTypeOf(signal).toExtend<AbortSignal | undefined>();
          if (signal?.aborted) {
            return Promise.reject(new Error("aborted"));
          }
          return Promise.resolve({ slug: organizationSlug });
        },
        membership: q.static({
          queryKey: null,
          queryFn: ({ signal }) => {
            expectTypeOf(signal).not.toBeAny();
            expectTypeOf(signal).toExtend<AbortSignal | undefined>();
            if (signal?.aborted) {
              return Promise.reject(new Error("aborted"));
            }
            return Promise.resolve({ active: true as boolean });
          },
        }),
      })),
    }),
  });

  expectTypeOf(session.me).toExtend<
    UseQueryOptions<
      { authenticated: boolean },
      Error,
      { authenticated: boolean },
      readonly ["session", "me"]
    >
  >();

  const orgNode = session.me.organizationBySlug("acme");
  expectTypeOf(orgNode).toExtend<
    UseQueryOptions<
      { slug: string },
      Error,
      { slug: string },
      readonly ["session", "me", "organizationBySlug", "organization", string]
    >
  >();

  const membershipNode = session.me.organizationBySlug("acme").membership;
  expectTypeOf(membershipNode).toExtend<
    UseQueryOptions<
      { active: boolean },
      Error,
      { active: boolean },
      readonly [
        "session",
        "me",
        "organizationBySlug",
        "organization",
        string,
        "membership",
      ]
    >
  >();
});

test("dynamic q.dynamic node preserves common TanStack query options", () => {
  const todos = q.createQueryKeys("todos", {
    list: q.dynamic((cursor: string) => ({
      queryKey: [cursor],
      queryFn: () => Promise.resolve([cursor]),
      enabled: cursor.length > 0,
      staleTime: 30_000,
      gcTime: 600_000,
      refetchOnWindowFocus: false,
      meta: { source: "test" },
    })),
  });

  const node = todos.list("a");
  expectTypeOf(node.enabled).toExtend<boolean | undefined>();
  expectTypeOf(node.staleTime).toExtend<number | undefined>();
  expectTypeOf(node.gcTime).toExtend<number | undefined>();
  expectTypeOf(node.meta).toExtend<Record<string, unknown> | undefined>();
});

test("static dependent node only carries the options the caller authored", () => {
  const reference = q.createQueryKeys("reference", {
    config: q.static({
      queryFn: () => Promise.resolve({ secretKey: "s", token: "t" }),
    }),
  });

  const session = q.createQueryKeys("session", {
    offers: q.static({
      dependsOn: { config: reference.config },
      staleTime: 60_000,
      queryFn: (_ctx, { config }) =>
        Promise.resolve([{ id: 1, token: config.token }]),
    }),
  });

  const node = session.offers;

  // A dependent node must only carry the options the caller authored, not the
  // entire react-query option bag. A leaked `enabled: (query) => boolean` makes
  // the node unassignable to stricter consumers such as `@tanstack/vue-query`.
  expectTypeOf(node).not.toHaveProperty("enabled");
  expectTypeOf(node).not.toHaveProperty("retry");
  expectTypeOf(node).not.toHaveProperty("refetchOnWindowFocus");
  expectTypeOf(node).toHaveProperty("staleTime");

  expectTypeOf(node.dependsOn.config.queryKey).toEqualTypeOf<
    readonly ["reference", "config"]
  >();
});

test("plain-object dynamic dependent is useQuery-ready without phantom options", () => {
  const config = q.createQueryKeys("config", {
    byProperty: q.dynamic((propertyId: string) => ({
      queryKey: [propertyId],
      queryFn: () => Promise.resolve({ secretKey: "s", token: "t" } as const),
    })),
  });

  const property = q.createQueryKeys("property", {
    offers: q.dynamic((propertyId: string) => ({
      queryKey: [propertyId],
      dependsOn: { config: config.byProperty(propertyId) },
      queryFn: (_ctx, { config: cfg }) =>
        Promise.resolve([{ id: 1, token: cfg.token }]),
    })),
  });

  const node = property.offers("property_1");

  // The node must not carry option keys that were never declared. A leaked
  // option bag (e.g. a react-query `enabled: (query) => boolean`) makes the
  // node unassignable to stricter consumers such as `@tanstack/vue-query`.
  expectTypeOf(node).not.toHaveProperty("enabled");
  expectTypeOf(node).not.toHaveProperty("retry");
  expectTypeOf(node).not.toHaveProperty("refetchOnWindowFocus");

  expectTypeOf(node.queryKey).toEqualTypeOf<
    readonly ["property", "offers", string]
  >();
  expectTypeOf(node.dependsOn.config.queryKey).toEqualTypeOf<
    readonly ["config", "byProperty", string]
  >();

  expectTypeOf(node).toExtend<
    UseQueryOptions<
      { id: number; token: string }[],
      Error,
      { id: number; token: string }[],
      readonly ["property", "offers", string]
    >
  >();
});

test("a dependent q.static node accepts and type-checks authored options", () => {
  const reference = q.createQueryKeys("reference", {
    config: q.static({
      queryFn: () => Promise.resolve({ token: "t" }),
    }),
  });

  const session = q.createQueryKeys("session", {
    offers: q.static({
      dependsOn: { config: reference.config },
      enabled: false,
      staleTime: 60_000,
      queryFn: (_ctx, { config }) =>
        Promise.resolve([{ id: 1, token: config.token }]),
    }),
  });

  const node = session.offers;
  expectTypeOf(node).toHaveProperty("enabled");
  expectTypeOf(node).toHaveProperty("staleTime");
  expectTypeOf<boolean>().toExtend<NonNullable<typeof node.enabled>>();

  // Authoring an option must not regress useQuery-readiness.
  expectTypeOf(node).toExtend<
    UseQueryOptions<
      { id: number; token: string }[],
      Error,
      { id: number; token: string }[],
      readonly ["session", "offers"]
    >
  >();
});

test("a dependent q.dynamic node accepts and type-checks authored options", () => {
  const reference = q.createQueryKeys("reference", {
    config: q.static({
      queryFn: () => Promise.resolve({ token: "t" }),
    }),
  });

  const property = q.createQueryKeys("property", {
    offers: q.dynamic((propertyId: string) => ({
      queryKey: [propertyId],
      dependsOn: { config: reference.config },
      enabled: propertyId.length > 0,
      gcTime: 600_000,
      queryFn: (_ctx, { config }) =>
        Promise.resolve([{ id: 1, token: config.token }]),
    })),
  });

  const node = property.offers("property_1");
  expectTypeOf(node).toHaveProperty("enabled");
  expectTypeOf(node).toHaveProperty("gcTime");
  expectTypeOf<boolean>().toExtend<NonNullable<typeof node.enabled>>();

  expectTypeOf(node).toExtend<
    UseQueryOptions<
      { id: number; token: string }[],
      Error,
      { id: number; token: string }[],
      readonly ["property", "offers", string]
    >
  >();
});

test("a mistyped option on a dependent node is rejected at the call site", () => {
  const reference = q.createQueryKeys("reference", {
    config: q.static({
      queryFn: () => Promise.resolve({ token: "t" }),
    }),
  });

  q.createQueryKeys("session", {
    offers: q.static({
      dependsOn: { config: reference.config },
      // @ts-expect-error enabled must be a boolean / predicate, not a string
      enabled: "nope",
      queryFn: (_ctx, _deps) => Promise.resolve([{ id: 1 }]),
    }),
  });
});
