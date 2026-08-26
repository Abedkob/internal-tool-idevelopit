import assert from "node:assert/strict";
import test from "node:test";
import { deleteTask, deleteTaskItem } from "./db.ts";

function deletionClient(expectedTable: string, expectedId: string, message?: string) {
  return {
    from(table: string) {
      assert.equal(table, expectedTable);
      return {
        delete() {
          return {
            async eq(column: string, id: string) {
              assert.equal(column, "id");
              assert.equal(id, expectedId);
              return { error: message ? { message } : null };
            },
          };
        },
      };
    },
  } as any;
}

test("task deletion targets only the selected task", async () => {
  await deleteTask(deletionClient("tasks", "task-1"), "task-1");
});

test("checklist deletion targets only the selected item", async () => {
  await deleteTaskItem(deletionClient("task_items", "item-1"), "item-1");
});

test("task deletion reports Supabase failures", async () => {
  await assert.rejects(
    deleteTask(deletionClient("tasks", "task-2", "Deletion denied"), "task-2"),
    /Deletion denied/,
  );
});
