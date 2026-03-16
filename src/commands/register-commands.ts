import type { Command } from "commander";
import { registerQuestionCommands } from "./question/register-question-commands.js";
import { registerTaskCommands } from "./task/register-task-commands.js";

export function registerCommands(program: Command): void {
  registerQuestionCommands(program);
  registerTaskCommands(program);
}
