import { createQueryKeyStore } from "../lib/create-query-key-store";

describe("createQueryKeyStore", () => {
  it("creates a store from the schema provided as argument", () => {
    interface Filters {
      preview: boolean;
      status: "completed" | "in-progress";
    }

    const store = createQueryKeyStore({
      users: {
        me: null,
        detail: (userId: string) => ({
          queryKey: [userId],
          queryFn: () => Promise.resolve({ id: userId }),
          settings: null,
        }),
      },
      todos: {
        detail: (todoId: string) => [todoId],
        list: (filters: Filters) => [{ filters }],
        search: (query: string, limit: number) => [query, limit],
      },
    });

    expect(Object.keys(store)).toHaveLength(2);

    expect(store).toHaveProperty("users");
    expect(store).toHaveProperty("todos");

    expect(store).toEqual({
      users: {
        _def: ["users"],
        me: {
          queryKey: ["users", "me"],
        },
        detail: expect.any(Function),
      },
      todos: {
        _def: ["todos"],
        detail: expect.any(Function),
        list: expect.any(Function),
        search: expect.any(Function),
      },
    });
  });
});
