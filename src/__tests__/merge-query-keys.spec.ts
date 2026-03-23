import { createQueryKeys } from "../lib/create-query-keys";
import { mergeQueryKeys } from "../lib/merge-query-keys";

describe("mergeQueryKeys", () => {
  interface Filters {
    preview: boolean;
    status: "completed" | "in-progress";
  }

  const performSetup = () => {
    const usersKeys = createQueryKeys("users", {
      me: null,
      detail: (userId: string) => ({
        queryKey: [userId],
        queryFn: () => Promise.resolve({ id: userId }),
        settings: null,
      }),
    });

    const todosKeys = createQueryKeys("todos", {
      detail: (todoId: string) => [todoId],
      list: (filters: Filters) => [{ filters }],
      search: (query: string, limit: number) => [query, limit],
    });

    return { usersKeys, todosKeys };
  };

  it("creates a named merge with _def when a string key is provided", () => {
    const { usersKeys, todosKeys } = performSetup();

    const named = mergeQueryKeys("myDomain", usersKeys, todosKeys);

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

    const nested = mergeQueryKeys("nested", todosKeys);
    const store = mergeQueryKeys(usersKeys, nested);

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
    const todosBase = createQueryKeys("todos", {
      detail: (todoId: string) => [todoId],
    });
    const todosSearch = createQueryKeys("todos", {
      search: (query: string, limit: number) => [query, limit],
    });

    const store = mergeQueryKeys(todosBase, todosSearch);

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

    const store = mergeQueryKeys(usersKeys, todosKeys);

    expect(store).toHaveProperty("users");
    expect(store).toHaveProperty("todos");

    expect(store).toEqual({
      users: usersKeys,
      todos: todosKeys,
    });
  });
});
