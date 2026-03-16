import type { Command } from "commander";
import { z } from "zod";
import { loadAgentCliConfig } from "../../config/config.js";
import { CliError } from "../../errors.js";
import { AgentQuestionClient } from "../../service/agent_question_client.js";
import { writeJsonStdout } from "../../utils/output.js";

const answerRankSchema = z.enum(["atrocious", "bad", "average", "good", "excellent"]);

const createQuestionPayloadSchema = z.object({
  threadId: z.string().trim().min(1, "threadId is required."),
  questionText: z.string().trim().min(1, "questionText is required."),
  options: z.array(
    z.object({
      text: z.string().trim().min(1, "options.text is required."),
      isRecommended: z.boolean().optional(),
      rank: answerRankSchema.optional(),
    }),
  ).default([]),
});

function parseAnswerRank(value: z.infer<typeof answerRankSchema>): number {
  switch (value) {
    case "atrocious":
      return 1;
    case "bad":
      return 2;
    case "average":
      return 3;
    case "good":
      return 4;
    case "excellent":
      return 5;
    default:
      throw new CliError("INVALID_ARGUMENT", `Unsupported rank '${value}'.`);
  }
}

function parseCreateQuestionPayload(jsonValue: string): {
  threadId: string;
  questionText: string;
  options: Array<{
    text: string;
    isRecommended?: boolean;
    rank?: number;
  }>;
} {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonValue);
  } catch {
    throw new CliError("INVALID_ARGUMENT", "--json must contain valid JSON.");
  }

  const result = createQuestionPayloadSchema.safeParse(parsedJson);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const issuePath = firstIssue?.path.length ? firstIssue.path.join(".") : "json";
    const issueMessage = firstIssue?.message ?? "invalid question payload";
    throw new CliError("INVALID_ARGUMENT", `${issuePath}: ${issueMessage}`);
  }

  return {
    threadId: result.data.threadId,
    questionText: result.data.questionText,
    options: result.data.options.map((option) => ({
      text: option.text,
      isRecommended: option.isRecommended,
      rank: option.rank ? parseAnswerRank(option.rank) : undefined,
    })),
  };
}

async function runWithQuestionClient(
  handler: (client: AgentQuestionClient) => Promise<Record<string, unknown>>,
): Promise<void> {
  const config = loadAgentCliConfig();
  const client = new AgentQuestionClient(config);

  try {
    const response = await handler(client);
    writeJsonStdout(response);
  } finally {
    client.close();
  }
}

export function registerQuestionCommands(program: Command): void {
  const questionCommand = program
    .command("question")
    .description("Question operations via AgentQuestionService.");

  questionCommand
    .command("create")
    .description("Create a question from a JSON payload.")
    .requiredOption("--json <json>", "Question JSON payload.")
    .action(async (options: { json: string }) => {
      const payload = parseCreateQuestionPayload(options.json);
      await runWithQuestionClient((client) => client.createQuestion(payload));
    });
}
