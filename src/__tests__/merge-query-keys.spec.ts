import { q } from "../lib/q";

const LEAF_COLLISION_AT_TODOS_DETAIL = /leaf collision at "todos\.detail"/;
const LEAF_COLLISION_RE = /leaf collision/;

describe("mergeQueryKeys", () => {
  interface Filters {
    preview: boolean;
    status: "completed" | "in-progress";
  }

  const performSetup = () => {
    const usersKeys = q.createQueryKeys("users", {
      me: q.static({ queryKey: null }),
      detail: q.dynamic((userId: string) => ({
        queryKey: [userId],
        queryFn: () => Promise.resolve({ id: userId }),
        settings: q.static({ queryKey: null }),
      })),
    });

    const todosKeys = q.createQueryKeys("todos", {
      detail: q.dynamic((todoId: string) => ({
        queryKey: [todoId],
      })),
      list: q.dynamic((filters: Filters) => ({
        queryKey: [{ filters }],
      })),
      search: q.dynamic((query: string, limit: number) => ({
        queryKey: [query, limit],
      })),
    });

    return { usersKeys, todosKeys };
  };

  it("creates a named merge with queryKey when a string key is provided", () => {
    const { usersKeys, todosKeys } = performSetup();

    const named = q.mergeQueryKeys("myDomain", usersKeys, todosKeys);

    expect(named).toHaveProperty("queryKey", ["myDomain"]);
    expect(named).toHaveProperty("users");
    expect(named).toHaveProperty("todos");

    expect(named).toEqual({
      queryKey: ["myDomain"],
      users: usersKeys,
      todos: todosKeys,
    });
  });

  it("allows named merges to be nested inside another merge", () => {
    const { usersKeys, todosKeys } = performSetup();

    const nested = q.mergeQueryKeys("nested", todosKeys);
    const store = q.mergeQueryKeys(usersKeys, nested);

    expect(store).toHaveProperty("users");
    expect(store).toHaveProperty("nested");
    expect(store.nested).toHaveProperty("todos");

    expect(store).toEqual({
      users: usersKeys,
      nested: {
        queryKey: ["nested"],
        todos: todosKeys,
      },
    });
  });

  it("deep-merges store units that share the same top-level key", () => {
    const todosBase = q.createQueryKeys("todos", {
      detail: q.dynamic((todoId: string) => ({
        queryKey: [todoId],
      })),
    });
    const todosSearch = q.createQueryKeys("todos", {
      search: q.dynamic((query: string, limit: number) => ({
        queryKey: [query, limit],
      })),
    });

    const store = q.mergeQueryKeys(todosBase, todosSearch);

    expect(store.todos).toHaveProperty("queryKey", ["todos"]);
    expect(store.todos).toHaveProperty("detail");
    expect(store.todos).toHaveProperty("search");
    expect(store.todos.detail).toBe(todosBase.detail);
    expect(store.todos.search).toBe(todosSearch.search);
  });

  it("throws when two units collide on the same leaf node", () => {
    const todosA = q.createQueryKeys("todos", {
      detail: q.dynamic((todoId: string) => ({
        queryKey: [todoId],
      })),
    });
    const todosB = q.createQueryKeys("todos", {
      detail: q.dynamic((todoId: string) => ({
        queryKey: [todoId, "v2"],
      })),
    });

    expect(() => q.mergeQueryKeys(todosA, todosB)).toThrow(
      LEAF_COLLISION_AT_TODOS_DETAIL
    );
  });

  it("merges the keys into a single store object using the scope names as properties", () => {
    const { usersKeys, todosKeys } = performSetup();

    const store = q.mergeQueryKeys(usersKeys, todosKeys);

    expect(store).toHaveProperty("users");
    expect(store).toHaveProperty("todos");

    expect(store).toEqual({
      users: usersKeys,
      todos: todosKeys,
    });
  });

  it("preserves identical queryKey values across overlapping scope keys", () => {
    const a = q.createQueryKeys("todos", {
      list: q.dynamic((page: number) => ({ queryKey: [page] })),
    });
    const b = q.createQueryKeys("todos", {
      detail: q.dynamic((id: string) => ({ queryKey: [id] })),
    });

    const store = q.mergeQueryKeys(a, b);

    expect(store.todos.queryKey).toEqual(["todos"]);
    expect(store.todos).toHaveProperty("list");
    expect(store.todos).toHaveProperty("detail");
  });

  it("throws when a deeper leaf collides under a shared scope", () => {
    const a = q.createQueryKeys("users", {
      me: q.static({ queryFn: () => Promise.resolve(1) }),
    });
    const b = q.createQueryKeys("users", {
      me: q.static({ queryFn: () => Promise.resolve(2) }),
    });

    expect(() => q.mergeQueryKeys(a, b)).toThrow(LEAF_COLLISION_RE);
  });
});
