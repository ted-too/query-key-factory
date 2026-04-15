import { q } from "../lib/q";

describe("createQueryKeyStore", () => {
  it("creates a store from the schema provided as argument", () => {
    interface Filters {
      preview: boolean;
      status: "completed" | "in-progress";
    }

    const store = q.createQueryKeyStore({
      users: {
        me: q.static({}),
        detail: q.dynamic((userId: string) =>
          q.static({
            queryKey: [userId],
            queryFn: () => Promise.resolve({ id: userId }),
            settings: q.static({}),
          })
        ),
      },
      todos: {
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
