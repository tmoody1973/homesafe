import { Button, Card, Chip } from "@heroui/react";
import { updateTaskAction } from "../actions";
import type { CaseTask } from "../../lib/case";

// Tasks the agent drafted from its own validated answers. Drafts stay drafts
// until the resident presses a button — the agent proposes, the person
// decides, and that boundary is a status column in CockroachDB, not a
// convention.
export function TaskList({
  caseId,
  tasks,
}: {
  readonly caseId: string;
  readonly tasks: readonly CaseTask[];
}) {
  if (tasks.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Suggested next steps
      </h3>
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li key={task.taskId}>
            <Card variant="transparent">
              <Card.Content className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <Chip color={task.status === "done" ? "success" : undefined}>
                    <Chip.Label>
                      {task.status === "done" ? "Done" : "Drafted by HomeSafe"}
                    </Chip.Label>
                  </Chip>
                </div>
                <p className="text-sm leading-relaxed">{task.title}</p>
                {task.status === "draft" && (
                  <div className="flex gap-2">
                    <form action={updateTaskAction}>
                      <input name="case_id" type="hidden" value={caseId} />
                      <input name="task_id" type="hidden" value={task.taskId} />
                      <input name="next_status" type="hidden" value="done" />
                      <Button size="sm" type="submit" variant="secondary">
                        Mark done
                      </Button>
                    </form>
                    <form action={updateTaskAction}>
                      <input name="case_id" type="hidden" value={caseId} />
                      <input name="task_id" type="hidden" value={task.taskId} />
                      <input name="next_status" type="hidden" value="dismissed" />
                      <Button size="sm" type="submit" variant="ghost">
                        Dismiss
                      </Button>
                    </form>
                  </div>
                )}
              </Card.Content>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
