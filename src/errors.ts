import * as grpc from "@grpc/grpc-js";
import { CommanderError } from "commander";

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

function isGrpcServiceError(error: unknown): error is grpc.ServiceError {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && typeof (error as { code?: unknown }).code === "number",
  );
}

function normalizeCommanderMessage(message: string): string {
  if (message === "(outputHelp)") {
    return "A command is required. See help output for usage.";
  }

  if (message.includes("See help output for usage.")) {
    return message;
  }

  if (message.endsWith(".")) {
    return `${message} See help output for usage.`;
  }

  return `${message}. See help output for usage.`;
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof CommanderError) {
    return new CliError("CLI_USAGE_ERROR", normalizeCommanderMessage(error.message), error.exitCode || 1);
  }

  if (isGrpcServiceError(error)) {
    const grpcCodeName = grpc.status[error.code] ?? "GRPC_ERROR";
    const message = error.details?.trim().length ? error.details : error.message;
    return new CliError(grpcCodeName, message || "gRPC request failed.", 1);
  }

  if (error instanceof Error) {
    return new CliError("INTERNAL_ERROR", error.message || "Unexpected error.", 1);
  }

  return new CliError("INTERNAL_ERROR", "Unexpected error.", 1);
}
