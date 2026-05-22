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
