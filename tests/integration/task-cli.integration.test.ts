import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import * as grpc from "@grpc/grpc-js";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

interface AgentTaskServiceDefinition {
  typeName: string;
  method: Record<string, { name: string }>;
}

interface AgentProtoModule {
  AgentTaskService: AgentTaskServiceDefinition;
  TaskStatus: Record<string, number>;
  GetTaskDetailsRequestSchema: unknown;
  GetTaskDetailsResponseSchema: unknown;
  ListTaskDependenciesRequestSchema: unknown;
  ListTaskDependenciesResponseSchema: unknown;
  ListDependentTasksRequestSchema: unknown;
  ListDependentTasksResponseSchema: unknown;
  ListSubTasksRequestSchema: unknown;
  ListSubTasksResponseSchema: unknown;
  ListTaskCommentsRequestSchema: unknown;
  ListTaskCommentsResponseSchema: unknown;
  UpdateTaskStatusRequestSchema: unknown;
  UpdateTaskStatusResponseSchema: unknown;
  AddTaskCommentRequestSchema: unknown;
  AddTaskCommentResponseSchema: unknown;
}

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const require = createRequire(import.meta.url);
const protosEntryPath = require.resolve("@companyhelm/protos");
const protosDistDirectory = dirname(protosEntryPath);
const agentProtoModulePath = resolve(
  protosDistDirectory,
  "gen",
  "companyhelm",
  "agent",
  "v1",
  "agent_pb.js",
);
const agentProto = require(agentProtoModulePath) as AgentProtoModule;

function buildRpcPath(methodName: string): string {
  return `/${agentProto.AgentTaskService.typeName}/${methodName}`.replace(/\/{2,}/g, "/");
}

function serializeWithSchema<T>(schema: unknown, value: T): Buffer {
  return Buffer.from(toBinary(schema as never, create(schema as never, value as never)));
}

function deserializeWithSchema<T>(schema: unknown, bytes: Buffer): T {
  return fromBinary(schema as never, bytes) as unknown as T;
}

function createAgentTaskServiceDefinition(): grpc.ServiceDefinition {
  const methods = agentProto.AgentTaskService.method;

  return {
    getTaskDetails: {
      path: buildRpcPath(methods.getTaskDetails.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer => serializeWithSchema(agentProto.GetTaskDetailsRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.GetTaskDetailsRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer =>
        serializeWithSchema(agentProto.GetTaskDetailsResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.GetTaskDetailsResponseSchema, bytes),
    },
    listTaskDependencies: {
      path: buildRpcPath(methods.listTaskDependencies.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer =>
        serializeWithSchema(agentProto.ListTaskDependenciesRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListTaskDependenciesRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer =>
        serializeWithSchema(agentProto.ListTaskDependenciesResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown =>
        deserializeWithSchema(agentProto.ListTaskDependenciesResponseSchema, bytes),
    },
    listDependentTasks: {
      path: buildRpcPath(methods.listDependentTasks.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer => serializeWithSchema(agentProto.ListDependentTasksRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListDependentTasksRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer =>
        serializeWithSchema(agentProto.ListDependentTasksResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListDependentTasksResponseSchema, bytes),
    },
    listSubTasks: {
      path: buildRpcPath(methods.listSubTasks.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer => serializeWithSchema(agentProto.ListSubTasksRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListSubTasksRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer => serializeWithSchema(agentProto.ListSubTasksResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListSubTasksResponseSchema, bytes),
    },
    listTaskComments: {
      path: buildRpcPath(methods.listTaskComments.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer =>
        serializeWithSchema(agentProto.ListTaskCommentsRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListTaskCommentsRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer =>
        serializeWithSchema(agentProto.ListTaskCommentsResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.ListTaskCommentsResponseSchema, bytes),
    },
    updateTaskStatus: {
      path: buildRpcPath(methods.updateTaskStatus.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer => serializeWithSchema(agentProto.UpdateTaskStatusRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.UpdateTaskStatusRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer => serializeWithSchema(agentProto.UpdateTaskStatusResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.UpdateTaskStatusResponseSchema, bytes),
    },
    addTaskComment: {
      path: buildRpcPath(methods.addTaskComment.name),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: unknown): Buffer => serializeWithSchema(agentProto.AddTaskCommentRequestSchema, request),
      requestDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.AddTaskCommentRequestSchema, bytes),
      responseSerialize: (response: unknown): Buffer => serializeWithSchema(agentProto.AddTaskCommentResponseSchema, response),
      responseDeserialize: (bytes: Buffer): unknown => deserializeWithSchema(agentProto.AddTaskCommentResponseSchema, bytes),
    },
  };
}

function startFakeServer(implementation: grpc.UntypedServiceImplementation): Promise<{ server: grpc.Server; port: number }> {
  const server = new grpc.Server();
  server.addService(createAgentTaskServiceDefinition(), implementation);

  return new Promise((resolvePromise, reject) => {
    server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        reject(error);
        return;
      }

      server.start();
      resolvePromise({ server, port });
    });
  });
}

function shutdownServer(server: grpc.Server): Promise<void> {
  return new Promise((resolvePromise) => {
    server.tryShutdown(() => resolvePromise());
  });
}

async function createHomeDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeConfig(homeDirectory: string, value: unknown): Promise<void> {
  const configPath = join(homeDirectory, ".config", "companyhelm-agent-cli", "config.json");
  await mkdir(join(homeDirectory, ".config", "companyhelm-agent-cli"), { recursive: true });
  await writeFile(configPath, JSON.stringify(value), "utf8");
}

function runCli(args: string[], homeDirectory: string): Promise<CliResult> {
  const cliPath = join(process.cwd(), "dist", "cli.js");
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: homeDirectory,
    },
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  return new Promise((resolvePromise, reject) => {
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (!directory) {
      continue;
    }

    await rm(directory, { recursive: true, force: true });
  }
});

describe("companyhelm-agent task CLI", () => {
  test("errors when required agent_api_url is missing in config", async () => {
    const homeDirectory = await createHomeDirectory("companyhelm-agent-missing-url-");
    temporaryDirectories.push(homeDirectory);

    await writeConfig(homeDirectory, {
      token: "test-token",
    });

    const result = await runCli(["task", "get", "--task-id", "task-1"], homeDirectory);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim()).toBe("");
    const stderrPayload = JSON.parse(result.stderr);
    expect(stderrPayload.error.code).toBe("CONFIG_ERROR");
    expect(String(stderrPayload.error.message)).toContain("agent_api_url");
  });

  test("errors when required token is missing in config", async () => {
    const homeDirectory = await createHomeDirectory("companyhelm-agent-missing-token-");
    temporaryDirectories.push(homeDirectory);

    await writeConfig(homeDirectory, {
      agent_api_url: "127.0.0.1:50052",
    });

    const result = await runCli(["task", "get", "--task-id", "task-1"], homeDirectory);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim()).toBe("");
    const stderrPayload = JSON.parse(result.stderr);
    expect(stderrPayload.error.code).toBe("CONFIG_ERROR");
    expect(String(stderrPayload.error.message)).toContain("token");
  });

  test("task get sends bearer token metadata and returns JSON result", async () => {
    const serverCalls: Array<{ authHeader: string; taskId: string }> = [];
    const started = await startFakeServer({
      getTaskDetails: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        const authHeader = String(call.metadata.get("authorization")[0] ?? "");
        serverCalls.push({
          authHeader,
          taskId: call.request.taskId,
        });

        callback(null, {
          task: {
            id: call.request.taskId,
            name: "Task One",
            status: agentProto.TaskStatus.PENDING,
            createdAt: { seconds: BigInt(1700000000), nanos: 0 },
            updatedAt: { seconds: BigInt(1700000001), nanos: 0 },
          },
        });
      },
      listTaskDependencies: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { tasks: [] });
      },
      listDependentTasks: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { tasks: [] });
      },
      listSubTasks: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { tasks: [] });
      },
      listTaskComments: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { comments: [] });
      },
      updateTaskStatus: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, {});
      },
      addTaskComment: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, {});
      },
    });

    try {
      const homeDirectory = await createHomeDirectory("companyhelm-agent-task-get-");
      temporaryDirectories.push(homeDirectory);

      await writeConfig(homeDirectory, {
        agent_api_url: `127.0.0.1:${started.port}`,
        token: "super-secret-token",
      });

      const result = await runCli(["task", "get", "--task-id", "task-123"], homeDirectory);

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
      const stdoutPayload = JSON.parse(result.stdout);
      expect(stdoutPayload.task.id).toBe("task-123");
      expect(stdoutPayload.task.name).toBe("Task One");
      expect(stdoutPayload.task.createdAt.seconds).toBe("1700000000");
      expect(serverCalls).toEqual([
        {
          authHeader: "Bearer super-secret-token",
          taskId: "task-123",
        },
      ]);
    } finally {
      await shutdownServer(started.server);
    }
  });

  test("task update-status maps status string to proto enum", async () => {
    const seenStatuses: number[] = [];
    const started = await startFakeServer({
      getTaskDetails: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, {});
      },
      listTaskDependencies: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { tasks: [] });
      },
      listDependentTasks: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { tasks: [] });
      },
      listSubTasks: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { tasks: [] });
      },
      listTaskComments: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, { comments: [] });
      },
      updateTaskStatus: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        seenStatuses.push(call.request.status);
        callback(null, {
          task: {
            id: call.request.taskId,
            name: "Task Status",
            status: call.request.status,
            createdAt: { seconds: BigInt(1700000100), nanos: 0 },
            updatedAt: { seconds: BigInt(1700000101), nanos: 0 },
          },
        });
      },
      addTaskComment: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void => {
        callback(null, {});
      },
    });

    try {
      const homeDirectory = await createHomeDirectory("companyhelm-agent-update-status-");
      temporaryDirectories.push(homeDirectory);

      await writeConfig(homeDirectory, {
        agent_api_url: `127.0.0.1:${started.port}`,
        token: "status-token",
      });

      const result = await runCli(
        ["task", "update-status", "--task-id", "task-7", "--status", "in_progress"],
        homeDirectory,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
      const stdoutPayload = JSON.parse(result.stdout);
      expect(stdoutPayload.task.id).toBe("task-7");
      expect(seenStatuses).toEqual([agentProto.TaskStatus.IN_PROGRESS]);
    } finally {
      await shutdownServer(started.server);
    }
  });
});
