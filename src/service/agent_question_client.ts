import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import * as grpc from "@grpc/grpc-js";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { AgentCliConfig } from "../config/config.js";
import { CliError } from "../errors.js";

interface AgentQuestionServiceDefinition {
  typeName: string;
  method: {
    createQuestion: { name: string };
  };
}

interface QuestionProtoModule {
  AgentQuestionService: AgentQuestionServiceDefinition;
  CreateQuestionRequestSchema: unknown;
  CreateQuestionResponseSchema: unknown;
}

interface AgentQuestionServiceClient extends grpc.Client {
  createQuestion(
    request: {
      threadId: string;
      questionText: string;
      options: Array<{
        text: string;
        isRecommended?: boolean;
        rank?: number;
      }>;
    },
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<Record<string, unknown>>,
  ): grpc.ClientUnaryCall;
}

type AgentQuestionServiceClientConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: grpc.ClientOptions,
) => AgentQuestionServiceClient;

type Endpoint = {
  target: string;
  pathPrefix: string;
  useTls: boolean;
};

const require = createRequire(import.meta.url);
const protosEntryPath = require.resolve("@companyhelm/protos");
const protosDistDirectory = dirname(protosEntryPath);
const questionProtoModulePath = resolve(
  protosDistDirectory,
  "gen",
  "companyhelm",
  "agent",
  "v1",
  "questions_pb.js",
);
const questionProto = require(questionProtoModulePath) as QuestionProtoModule;

function normalizePathPrefix(value: string): string {
  if (!value || value === "/") {
    return "";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/g, "");
  return withoutTrailingSlash === "/" ? "" : withoutTrailingSlash;
}

function buildRpcPath(methodName: string, pathPrefix: string): string {
  return `${normalizePathPrefix(pathPrefix)}/${questionProto.AgentQuestionService.typeName}/${methodName}`.replace(/\/{2,}/g, "/");
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

function createAgentQuestionServiceDefinition(pathPrefix = ""): grpc.ServiceDefinition {
  const methods = questionProto.AgentQuestionService.method;

  return {
    createQuestion: {
      path: buildRpcPath(methods.createQuestion.name, pathPrefix),
      requestStream: false,
      responseStream: false,
      requestSerialize: (request: {
        threadId: string;
        questionText: string;
        options: Array<{
          text: string;
          isRecommended?: boolean;
          rank?: number;
        }>;
      }): Buffer => serializeWithSchema(questionProto.CreateQuestionRequestSchema, request),
      requestDeserialize: (bytes: Buffer): {
        threadId: string;
        questionText: string;
        options: Array<{
          text: string;
          isRecommended?: boolean;
          rank?: number;
        }>;
      } => deserializeWithSchema(questionProto.CreateQuestionRequestSchema, bytes),
      responseSerialize: (response: Record<string, unknown>): Buffer =>
        serializeWithSchema(questionProto.CreateQuestionResponseSchema, response),
      responseDeserialize: (bytes: Buffer): Record<string, unknown> =>
        deserializeWithSchema(questionProto.CreateQuestionResponseSchema, bytes),
    },
  };
}

function createClient(endpoint: Endpoint): AgentQuestionServiceClient {
  const ClientCtor = grpc.makeGenericClientConstructor(
    createAgentQuestionServiceDefinition(endpoint.pathPrefix),
    "AgentQuestionService",
  ) as unknown as AgentQuestionServiceClientConstructor;

  const credentials = endpoint.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  return new ClientCtor(endpoint.target, credentials);
}

export class AgentQuestionClient {
  private readonly client: AgentQuestionServiceClient;
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

  createQuestion(request: {
    threadId: string;
    questionText: string;
    options: Array<{
      text: string;
      isRecommended?: boolean;
      rank?: number;
    }>;
  }): Promise<Record<string, unknown>> {
    return new Promise((resolvePromise, reject) => {
      this.client.createQuestion(request, this.metadata, {}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(response ?? {});
      });
    });
  }
}
