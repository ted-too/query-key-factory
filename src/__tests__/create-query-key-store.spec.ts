import { q } from "../lib/q";

describe("createQueryKeyStore", () => {
  it("creates a store from the schema provided as argument", () => {
    interface Filters {
      preview: boolean;
      status: "completed" | "in-progress";
    }

    const store = q.createQueryKeyStore({
      users: {
        me: q.static({ queryKey: null }),
        detail: q.dynamic((userId: string) => ({
          queryKey: [userId],
          queryFn: () => Promise.resolve({ id: userId }),
          settings: q.static({ queryKey: null }),
        })),
      },
      todos: {
        detail: q.dynamic((todoId: string) => ({
          queryKey: [todoId],
        })),
        list: q.dynamic((filters: Filters) => ({
          queryKey: [{ filters }],
        })),
        search: q.dynamic((query: string, limit: number) => ({
          queryKey: [query, limit],
        })),
      },
    });

    expect(Object.keys(store)).toHaveLength(2);

    expect(store).toHaveProperty("users");
    expect(store).toHaveProperty("todos");

    expect(store).toEqual({
      users: {
        queryKey: ["users"],
        me: {
          queryKey: ["users", "me"],
        },
        detail: expect.any(Function),
      },
      todos: {
        queryKey: ["todos"],
        detail: expect.any(Function),
        list: expect.any(Function),
        search: expect.any(Function),
      },
    });
  });
});
