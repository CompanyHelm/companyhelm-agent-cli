import type { Command } from "commander";
import { loadAgentCliConfig } from "../../config/config.js";
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

export function registerTaskCommands(program: Command): void {
  const taskCommand = program
    .command("task")
    .description("Task operations via AgentTaskService.");

  taskCommand
    .command("get")
    .description("Get task details.")
    .requiredOption("--task-id <taskId>", "Task id.")
    .action(async (options: { taskId: string }) => runWithTaskClient((client) => client.getTaskDetails(options.taskId)));

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
    .option("--include-non-blocking", "Include non-blocking dependencies.")
    .action(async (options: { taskId: string; includeNonBlocking?: boolean }) =>
      runWithTaskClient((client) => client.listSubTasks(options.taskId, Boolean(options.includeNonBlocking))));

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
