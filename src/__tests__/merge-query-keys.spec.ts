import { q } from "../lib/q";

describe("mergeQueryKeys", () => {
  interface Filters {
    preview: boolean;
    status: "completed" | "in-progress";
  }

  const performSetup = () => {
    const usersKeys = q.createQueryKeys("users", {
      me: q.static({}),
      detail: q.dynamic((userId: string) =>
        q.static({
          queryKey: [userId],
          queryFn: () => Promise.resolve({ id: userId }),
          settings: q.static({}),
        })
      ),
    });

    const todosKeys = q.createQueryKeys("todos", {
      detail: q.dynamic((todoId: string) =>
        q.static({
          queryKey: [todoId],
        })
      ),
      list: q.dynamic((filters: Filters) =>
        q.static({
          queryKey: [{ filters }],
        })
      ),
      search: q.dynamic((query: string, limit: number) =>
        q.static({
          queryKey: [query, limit],
        })
      ),
    });

    return { usersKeys, todosKeys };
  };

  it("creates a named merge with _def when a string key is provided", () => {
    const { usersKeys, todosKeys } = performSetup();

    const named = q.mergeQueryKeys("myDomain", usersKeys, todosKeys);

    expect(named).toHaveProperty("_def", ["myDomain"]);
    expect(named).toHaveProperty("users");
    expect(named).toHaveProperty("todos");

    expect(named).toEqual({
      _def: ["myDomain"],
      users: usersKeys,
      todos: todosKeys,
    });

    expect(named._def).toEqual(["myDomain"]);
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
        _def: ["nested"],
        todos: todosKeys,
      },
    });
  });

  it("merges store units that share the same top-level key", () => {
    const todosBase = q.createQueryKeys("todos", {
      detail: q.dynamic((todoId: string) =>
        q.static({
          queryKey: [todoId],
        })
      ),
    });
    const todosSearch = q.createQueryKeys("todos", {
      search: q.dynamic((query: string, limit: number) =>
        q.static({
          queryKey: [query, limit],
        })
      ),
    });

    const store = q.mergeQueryKeys(todosBase, todosSearch);

    expect(store).toEqual({
      todos: {
        ...todosBase,
        ...todosSearch,
      },
    });

    expect(store.todos).toHaveProperty("detail");
    expect(store.todos).toHaveProperty("search");
  });

  it('merges the keys into a single store object using the "_def" values as the properties', () => {
    const { usersKeys, todosKeys } = performSetup();

    const store = q.mergeQueryKeys(usersKeys, todosKeys);

    expect(store).toHaveProperty("users");
    expect(store).toHaveProperty("todos");

    expect(store).toEqual({
      users: usersKeys,
      todos: todosKeys,
    });
  });
});
