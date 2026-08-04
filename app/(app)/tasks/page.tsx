import { Suspense } from "react";
import { TasksClient } from "@/components/tasks/TasksClient";
export const metadata = { title: "Tasks" };
export default function TasksPage() {
  return (
    <Suspense
      fallback={<div className="surface loading-state">Loading tasks...</div>}
    >
      <TasksClient />
    </Suspense>
  );
}
