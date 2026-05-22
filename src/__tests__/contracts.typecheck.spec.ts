import { expectTypeOf, test } from "vitest";
import { q } from "../lib/q";

test("contract: queryKey is the single typed identifier on every node", () => {
  const users = q.createQueryKeys("users", {
    me: q.static({ queryFn: () => Promise.resolve(1) }),
    versioned: q.static({
      queryKey: ["v2"],
      queryFn: () => Promise.resolve(1),
    }),
    detail: q.dynamic((id: string) => ({
      queryKey: [id],
      queryFn: () => Promise.resolve({ id }),
      settings: q.static({ queryKey: null }),
    })),
  });

  expectTypeOf(users.queryKey).toEqualTypeOf<readonly ["users"]>();

  expectTypeOf(users.me.queryKey).toEqualTypeOf<readonly ["users", "me"]>();

  expectTypeOf(users.versioned.queryKey).toEqualTypeOf<
    readonly ["users", "versioned", "v2"]
  >();

  expectTypeOf(users.detail.queryKey).toEqualTypeOf<
    readonly ["users", "detail"]
  >();

  const detail = users.detail("user_1");
  expectTypeOf(detail.queryKey).toExtend<readonly unknown[]>();
  expectTypeOf(detail.settings.queryKey).toExtend<readonly unknown[]>();
});

test("contract: q.static({}) is rejected at the type level", () => {
  const _typeOnly = () => {
    // @ts-expect-error empty static body is rejected
    q.static({});

    q.static({ queryKey: null });
    q.static({ queryFn: () => Promise.resolve(1) });
    q.static({ child: q.static({ queryFn: () => Promise.resolve(1) }) });
  };
  expectTypeOf(_typeOnly).toBeFunction();
});

test("contract: namespace-only q.static (only children) is fine", () => {
  const users = q.createQueryKeys("users", {
    me: q.static({
      sessions: q.static({ queryFn: () => Promise.resolve(["sess_1"]) }),
    }),
  });

  expectTypeOf(users.me.queryKey).toEqualTypeOf<readonly ["users", "me"]>();
  expectTypeOf(users.me.sessions.queryKey).toEqualTypeOf<
    readonly ["users", "me", "sessions"]
  >();
});
