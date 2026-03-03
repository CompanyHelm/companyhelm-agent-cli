import type { Command } from "commander";
import { loadAgentCliConfig } from "../../config/config.js";
import { CliError } from "../../errors.js";
import { AgentTaskClient, parseTaskStatus } from "../../service/agent_task_client.js";
import { writeJsonStdout } from "../../utils/output.js";

async function runWithTaskClient(handler: (client: AgentTaskClient) => Promise<Record<string, unknown>>): Promise<void> {
  const config = loadAgentCliConfig();
  const client = new AgentTaskClient(config);

  try {
    const response = await handler(client);
    writeJsonStdout(response);
  } finally {
    client.close();
  }
}

function parseOptionalPageSize(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new CliError("INVALID_ARGUMENT", "page-size must be an integer between 0 and 1000.");
  }

  return parsed;
}

export function registerTaskCommands(program: Command): void {
  const taskCommand = program
    .command("task")
    .description("Task operations via AgentTaskService.");

  taskCommand
    .command("create")
    .description("Create a task.")
    .requiredOption("--name <name>", "Task name.")
    .option("--description <description>", "Task description.")
    .option("--acceptance-criteria <acceptanceCriteria>", "Acceptance criteria.")
    .option("--assignee-principal-id <assigneePrincipalId>", "Assignee principal id.")
    .option("--thread-id <threadId>", "Thread id.")
    .option("--parent-task-id <parentTaskId>", "Parent task id.")
    .action(async (options: {
      name: string;
      description?: string;
      acceptanceCriteria?: string;
      assigneePrincipalId?: string;
      threadId?: string;
      parentTaskId?: string;
    }) =>
      runWithTaskClient((client) =>
        client.createTask({
          name: options.name,
          description: options.description,
          acceptanceCriteria: options.acceptanceCriteria,
          assigneePrincipalId: options.assigneePrincipalId,
          threadId: options.threadId,
          parentTaskId: options.parentTaskId,
        })));

  taskCommand
    .command("list")
    .description("List tasks with pagination support.")
    .option("--page-size <pageSize>", "Page size. 0 uses server default.")
    .option("--page-token <pageToken>", "Opaque page token from a previous response.")
    .action(async (options: { pageSize?: string; pageToken?: string }) => {
      const pageSize = parseOptionalPageSize(options.pageSize);
      await runWithTaskClient((client) => client.listTasks({
        pageSize,
        pageToken: options.pageToken,
      }));
    });

  taskCommand
    .command("get")
    .description("Get task details.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .action(async (options: { taskId: string }) => runWithTaskClient((client) => client.getTaskDetails(options.taskId)));

  taskCommand
    .command("add-dependency")
    .description("Add a dependency edge for a task.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .requiredOption("--dependency-task-id <dependencyTaskId>", "Dependency task id.")
    .action(async (options: { taskId: string; dependencyTaskId: string }) =>
      runWithTaskClient((client) => client.addTaskDependency(options.taskId, options.dependencyTaskId)));

  taskCommand
    .command("dependencies")
    .description("List direct task dependencies.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .action(async (options: { taskId: string }) => runWithTaskClient((client) => client.listTaskDependencies(options.taskId)));

  taskCommand
    .command("dependent")
    .description("List tasks that depend on this task.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .action(async (options: { taskId: string }) => runWithTaskClient((client) => client.listDependentTasks(options.taskId)));

  taskCommand
    .command("subtasks")
    .description("List dependency-backed subtasks.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .action(async (options: { taskId: string }) => runWithTaskClient((client) => client.listSubTasks(options.taskId)));

  taskCommand
    .command("comments")
    .description("List task comments.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .action(async (options: { taskId: string }) => runWithTaskClient((client) => client.listTaskComments(options.taskId)));

  taskCommand
    .command("update-status")
    .description("Update task status.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .requiredOption("--status <status>", "Status: draft|pending|in_progress|completed.")
    .action(async (options: { taskId: string; status: string }) => {
      const status = parseTaskStatus(options.status);
      await runWithTaskClient((client) => client.updateTaskStatus(options.taskId, status));
    });

  taskCommand
    .command("add-comment")
    .description("Add a comment to a task.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .requiredOption("--comment <comment>", "Comment text.")
    .action(async (options: { taskId: string; comment: string }) =>
      runWithTaskClient((client) => client.addTaskComment(options.taskId, options.comment)));
}
