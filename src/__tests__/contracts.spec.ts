import { q } from "../lib/q";

const EMPTY_STATIC_REJECTION_RE = /q\.static\(\{\}\) is not allowed/;

describe("contract: queryKey is the single identifier on every node", () => {
  it("top-level scope container carries the scope key as its queryKey", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({ queryFn: () => Promise.resolve(1) }),
    });

    expect(users.queryKey).toEqual(["users"]);
  });

  it("static node carries its full computed path as queryKey", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({ queryFn: () => Promise.resolve(1) }),
    });

    expect(users.me.queryKey).toEqual(["users", "me"]);
  });

  it("static node with a queryKey suffix appends to the computed path", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({
        queryKey: ["v2"],
        queryFn: () => Promise.resolve(1),
      }),
    });

    expect(users.me.queryKey).toEqual(["users", "me", "v2"]);
  });

  it("dynamic callback carries the base path as queryKey; the result carries the full computed path", () => {
    const users = q.createQueryKeys("users", {
      detail: q.dynamic((id: string) => ({
        queryKey: [id],
        queryFn: () => Promise.resolve({ id }),
      })),
    });

    expect(users.detail.queryKey).toEqual(["users", "detail"]);

    const result = users.detail("user_1");
    expect(result.queryKey).toEqual(["users", "detail", "user_1"]);
  });

  it("nested children inherit the same rule (path-only, suffix, or dynamic)", () => {
    const users = q.createQueryKeys("users", {
      detail: q.dynamic((id: string) => ({
        queryKey: [id],
        settings: q.static({ queryKey: null }),
        sessions: q.dynamic((sessionId: string) => ({
          queryKey: [sessionId],
        })),
      })),
    });

    const detail = users.detail("user_1");

    expect(detail.settings.queryKey).toEqual([
      "users",
      "detail",
      "user_1",
      "settings",
    ]);

    expect(detail.sessions.queryKey).toEqual([
      "users",
      "detail",
      "user_1",
      "sessions",
    ]);

    const sessionResult = detail.sessions("session_1");
    expect(sessionResult.queryKey).toEqual([
      "users",
      "detail",
      "user_1",
      "sessions",
      "session_1",
    ]);
  });

  it("no node exposes a `_def` property", () => {
    const users = q.createQueryKeys("users", {
      detail: q.dynamic((id: string) => ({
        queryKey: [id],
        settings: q.static({ queryKey: null }),
      })),
    });

    expect(users).not.toHaveProperty("_def");
    expect(users.detail).not.toHaveProperty("_def");
    expect(users.detail("u").settings).not.toHaveProperty("_def");
  });
});

describe("contract: queryKey null / undefined / absent are equivalent", () => {
  const expectedKey = ["users", "me"];

  it("queryKey: null produces the path-only key", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({ queryKey: null }),
    });
    expect(users.me.queryKey).toEqual(expectedKey);
  });

  it("queryKey: undefined produces the same path-only key", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({ queryKey: undefined }),
    });
    expect(users.me.queryKey).toEqual(expectedKey);
  });

  it("absent queryKey produces the same path-only key (with at least one other property)", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({ queryFn: () => Promise.resolve(1) }),
    });
    expect(users.me.queryKey).toEqual(expectedKey);
  });
});

describe("contract: q.static cannot be empty", () => {
  it("throws at runtime when called with {}", () => {
    const callEmptyStatic = q.static as unknown as (def: object) => unknown;
    expect(() => callEmptyStatic({})).toThrow(EMPTY_STATIC_REJECTION_RE);
  });
});

describe("contract: namespace-only q.static (children, no queryFn / queryKey)", () => {
  it("supports a parent q.static with only nested children", () => {
    const users = q.createQueryKeys("users", {
      me: q.static({
        sessions: q.static({
          queryFn: () => Promise.resolve(["sess_1"]),
        }),
      }),
    });

    expect(users.me.queryKey).toEqual(["users", "me"]);
    expect(users.me.sessions.queryKey).toEqual(["users", "me", "sessions"]);
    expect(users.me.sessions.queryFn).toEqual(expect.any(Function));
  });
});

describe("contract: q.dynamic factory may be called many times (memoisation allowed)", () => {
  it("each call returns equivalent output for the same args (deep-equal keys; queryFn is a fresh closure)", () => {
    const users = q.createQueryKeys("users", {
      detail: q.dynamic((id: string) => ({
        queryKey: [id],
        queryFn: () => Promise.resolve({ id }),
      })),
    });

    const a = users.detail("user_1");
    const b = users.detail("user_1");

    expect(a.queryKey).toEqual(b.queryKey);
    expect(typeof a.queryFn).toBe("function");
    expect(typeof b.queryFn).toBe("function");
  });

  it("different args produce different keys", () => {
    const users = q.createQueryKeys("users", {
      detail: q.dynamic((id: string) => ({
        queryKey: [id],
      })),
    });

    expect(users.detail("a").queryKey).not.toEqual(users.detail("b").queryKey);
  });
});
