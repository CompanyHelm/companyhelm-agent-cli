import type { Command } from "commander";
import { registerTaskCommands } from "./task/register-task-commands.js";

export function registerCommands(program: Command): void {
  registerTaskCommands(program);
}
