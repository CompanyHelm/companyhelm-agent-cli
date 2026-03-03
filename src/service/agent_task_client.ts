import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import * as grpc from "@grpc/grpc-js";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { AgentCliConfig } from "../config/config.js";
import { CliError } from "../errors.js";

interface AgentTaskServiceDefinition {
  typeName: string;
  method: {
    getTaskDetails: { name: string };
    listTaskDependencies: { name: string };
    listDependentTasks: { name: string };
    listSubTasks: { name: string };
    listTaskComments: { name: string };
    updateTaskStatus: { name: string };
    addTaskComment: { name: string };
  };
}

interface AgentProtoModule {
  AgentTaskService: AgentTaskServiceDefinition;
  TaskStatus: {
    DRAFT: number;
    PENDING: number;
    IN_PROGRESS: number;
    COMPLETED: number;
  };
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

interface AgentTaskServiceClient extends grpc.Client {
  getTaskDetails(
    request: { taskId: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
  listTaskDependencies(
    request: { taskId: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
  listDependentTasks(
    request: { taskId: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
  listSubTasks(
    request: { taskId: string; includeNonBlocking: boolean },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
  listTaskComments(
    request: { taskId: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
  updateTaskStatus(
    request: { taskId: string; status: number },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
  addTaskComment(
    request: { taskId: string; comment: string },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
}

type AgentTaskServiceClientConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: grpc.ClientOptions,
) => AgentTaskServiceClient;

type Endpoint = {
  target: string;
  pathPrefix: string;
  useTls: boolean;
};

type AgentTaskClientMethod =
  | "getTaskDetails"
  | "listTaskDependencies"
  | "listDependentTasks"
  | "listSubTasks"
  | "listTaskComments"
  | "updateTaskStatus"
  | "addTaskComment";

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

const TASK_STATUS_MAP: Record<string, number> = {
  draft: agentProto.TaskStatus.DRAFT,
  pending: agentProto.TaskStatus.PENDING,
  in_progress: agentProto.TaskStatus.IN_PROGRESS,
  completed: agentProto.TaskStatus.COMPLETED,
};

function normalizePathPrefix(value: string): string {
  if (!value || value === "/") {
    return "";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/g, "");
  return withoutTrailingSlash === "/" ? "" : withoutTrailingSlash;
}

function buildRpcPath(methodName: string, pathPrefix: string): string {
  return `${normalizePathPrefix(pathPrefix)}/${agentProto.AgentTaskService.typeName}/${methodName}`.replace(/\/{2,}/g, "/");
}

function extractTargetHost(target: string): string {
  const trimmed = target.trim().toLowerCase();

  if (trimmed.startsWith("[")) {
    const closingBracketIndex = trimmed.indexOf("]");
    if (closingBracketIndex > 0) {
      return trimmed.slice(1, closingBracketIndex);
    }
  }

  const colonIndex = trimmed.indexOf(":");
  return colonIndex >= 0 ? trimmed.slice(0, colonIndex) : trimmed;
}

function isLikelyLocalTarget(target: string): boolean {
  const host = extractTargetHost(target);
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function parseAgentApiUrl(value: string): Endpoint {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CliError("CONFIG_ERROR", "agent_api_url is required.");
  }

  if (trimmed.includes("://")) {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.includes(":") ? `[${parsed.hostname}]` : parsed.hostname;
    const target = parsed.port ? `${host}:${parsed.port}` : host;
    if (!target) {
      throw new CliError("CONFIG_ERROR", "agent_api_url is invalid.");
    }

    return {
      target,
      pathPrefix: normalizePathPrefix(parsed.pathname),
      useTls: parsed.protocol !== "http:",
    };
  }

  const firstSlash = trimmed.indexOf("/");
  const target = firstSlash >= 0 ? trimmed.slice(0, firstSlash) : trimmed;
  const pathPrefix = firstSlash >= 0 ? trimmed.slice(firstSlash) : "";
  if (!target) {
    throw new CliError("CONFIG_ERROR", "agent_api_url is invalid.");
  }

  return {
    target,
    pathPrefix: normalizePathPrefix(pathPrefix),
    useTls: !isLikelyLocalTarget(target),
  };
}

function serializeWithSchema<TMessage>(schema: unknown, value: TMessage): Buffer {
  return Buffer.from(
    toBinary(
      schema as never,
      create(schema as never, value as never),
    ),
  );
}

function deserializeWithSchema<TMessage>(schema: unknown, bytes: Buffer): TMessage {
  return fromBinary(schema as never, bytes) as unknown as TMessage;
}

function createAgentTaskServiceDefinition(pathPrefix = ""): grpc.ServiceDefinition {
  const methods = agentProto.AgentTaskService.method;

  return {
    getTaskDetails: {
      path: buildRpcPath(methods.getTaskDetails.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string }): Buffer =>
        serializeWithSchema(agentProto.GetTaskDetailsRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string } =>
        deserializeWithSchema(agentProto.GetTaskDetailsRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.GetTaskDetailsResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.GetTaskDetailsResponseSchema, bytes),
    },
    listTaskDependencies: {
      path: buildRpcPath(methods.listTaskDependencies.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string }): Buffer =>
        serializeWithSchema(agentProto.ListTaskDependenciesRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string } =>
        deserializeWithSchema(agentProto.ListTaskDependenciesRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.ListTaskDependenciesResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.ListTaskDependenciesResponseSchema, bytes),
    },
    listDependentTasks: {
      path: buildRpcPath(methods.listDependentTasks.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string }): Buffer =>
        serializeWithSchema(agentProto.ListDependentTasksRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string } =>
        deserializeWithSchema(agentProto.ListDependentTasksRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.ListDependentTasksResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.ListDependentTasksResponseSchema, bytes),
    },
    listSubTasks: {
      path: buildRpcPath(methods.listSubTasks.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string; includeNonBlocking: boolean }): Buffer =>
        serializeWithSchema(agentProto.ListSubTasksRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string; includeNonBlocking: boolean } =>
        deserializeWithSchema(agentProto.ListSubTasksRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.ListSubTasksResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.ListSubTasksResponseSchema, bytes),
    },
    listTaskComments: {
      path: buildRpcPath(methods.listTaskComments.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string }): Buffer =>
        serializeWithSchema(agentProto.ListTaskCommentsRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string } =>
        deserializeWithSchema(agentProto.ListTaskCommentsRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.ListTaskCommentsResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.ListTaskCommentsResponseSchema, bytes),
    },
    updateTaskStatus: {
      path: buildRpcPath(methods.updateTaskStatus.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string; status: number }): Buffer =>
        serializeWithSchema(agentProto.UpdateTaskStatusRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string; status: number } =>
        deserializeWithSchema(agentProto.UpdateTaskStatusRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.UpdateTaskStatusResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.UpdateTaskStatusResponseSchema, bytes),
    },
    addTaskComment: {
      path: buildRpcPath(methods.addTaskComment.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: { taskId: string; comment: string }): Buffer =>
        serializeWithSchema(agentProto.AddTaskCommentRequestSchema, request),
      requestDeserialize: (bytes: Buffer): { taskId: string; comment: string } =>
        deserializeWithSchema(agentProto.AddTaskCommentRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(agentProto.AddTaskCommentResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(agentProto.AddTaskCommentResponseSchema, bytes),
    },
  };
}

function createClient(endpoint: Endpoint): AgentTaskServiceClient {
  const ClientCtor = grpc.makeGenericClientConstructor(
    createAgentTaskServiceDefinition(endpoint.pathPrefix),
    "AgentTaskService",
  ) as unknown as AgentTaskServiceClientConstructor;

  const credentials = endpoint.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  return new ClientCtor(endpoint.target, credentials);
}

export function parseTaskStatus(value: string): number {
  const normalized = value.trim().toLowerCase();
  const mapped = TASK_STATUS_MAP[normalized];

  if (mapped === undefined) {
    throw new CliError(
      "INVALID_ARGUMENT",
      "status must be one of: draft, pending, in_progress, completed.",
    );
  }

  return mapped;
}

export class AgentTaskClient {
  private readonly client: AgentTaskServiceClient;
  private readonly metadata: grpc.Metadata;

  constructor(config: AgentCliConfig) {
    const endpoint = parseAgentApiUrl(config.agent_api_url);
    this.client = createClient(endpoint);
    this.metadata = new grpc.Metadata();
    this.metadata.set("authorization", `Bearer ${config.token}`);
  }

  close(): void {
    this.client.close();
  }

  private unary(
    method: AgentTaskClientMethod,
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolvePromise, reject) => {
      this.client[method](request as never, this.metadata, {}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(response ?? {});
      });
    });
  }

  getTaskDetails(taskId: string): Promise<Record<string, unknown>> {
    return this.unary("getTaskDetails", { taskId });
  }

  listTaskDependencies(taskId: string): Promise<Record<string, unknown>> {
    return this.unary("listTaskDependencies", { taskId });
  }

  listDependentTasks(taskId: string): Promise<Record<string, unknown>> {
    return this.unary("listDependentTasks", { taskId });
  }

  listSubTasks(taskId: string, includeNonBlocking: boolean): Promise<Record<string, unknown>> {
    return this.unary("listSubTasks", { taskId, includeNonBlocking });
  }

  listTaskComments(taskId: string): Promise<Record<string, unknown>> {
    return this.unary("listTaskComments", { taskId });
  }

  updateTaskStatus(taskId: string, status: number): Promise<Record<string, unknown>> {
    return this.unary("updateTaskStatus", { taskId, status });
  }

  addTaskComment(taskId: string, comment: string): Promise<Record<string, unknown>> {
    return this.unary("addTaskComment", { taskId, comment });
  }
}
