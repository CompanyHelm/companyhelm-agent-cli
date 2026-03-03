# CompanyHelm Agent CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a non-interactive npm TypeScript CLI wrapper around `AgentTaskService` with explicit task subcommands, required config token auth, and JSON-only IO for LLM agent consumption.

**Architecture:** The CLI reads JSON config from `~/.config/companyhelm-agent-cli/config.json`, validates required `agent_api_url` and `token`, constructs a gRPC client for `AgentTaskService`, and dispatches explicit `task` subcommands. All successful results print JSON to stdout; all failures print structured JSON to stderr and exit non-zero.

**Tech Stack:** TypeScript, Node.js, Commander, gRPC (`@grpc/grpc-js`), Buf protobuf runtime, Vitest.

---

### Task 1: Scaffold CLI project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `README.md`, `.gitignore`
- Create: `src/`, `tests/`, `vendor/`

**Step 1: Add npm package metadata and scripts**
- Add build/start/test scripts and bin entries for `companyhelm-agent` and `companyhelm-agent-cli`.

**Step 2: Add TypeScript and test configuration**
- Add compiler settings and Vitest configuration.

**Step 3: Vendor protobuf package tarball**
- Add `vendor/companyhelm-protos-0.5.8.tgz` and reference it via `file:` dependency.

### Task 2: Write failing integration tests (RED)

**Files:**
- Test: `tests/integration/task-cli.integration.test.ts`

**Step 1: Write test for missing config fields**
- Validate missing `agent_api_url` and missing `token` produce structured JSON error and non-zero exit.

**Step 2: Write test for `task get` success and metadata auth**
- Start fake gRPC server and verify `authorization: Bearer <token>` metadata arrives.

**Step 3: Write test for status update mapping**
- Ensure `task update-status` maps status strings to proto enums and returns JSON task payload.

### Task 3: Implement config + gRPC client + commands (GREEN)

**Files:**
- Create: `src/config/config.ts`
- Create: `src/service/agent_task_client.ts`
- Create: `src/commands/task/register-task-commands.ts`
- Create: `src/commands/register-commands.ts`
- Create: `src/cli.ts`
- Create: `src/utils/output.ts`

**Step 1: Implement config loading/validation**
- Load from `~/.config/companyhelm-agent-cli/config.json` and require `agent_api_url` + `token`.

**Step 2: Implement AgentTaskService gRPC wrapper**
- Expose unary wrappers for all task methods and attach auth metadata.

**Step 3: Implement explicit subcommands**
- Add `task get|dependencies|dependent|subtasks|comments|update-status|add-comment`.

**Step 4: Implement deterministic JSON output and error handling**
- stdout: JSON payload only.
- stderr: `{ "error": { "code": "...", "message": "..." } }`, process exit code `1`.

### Task 4: Verify and publish

**Files:**
- Modify: as needed for final fixes

**Step 1: Run tests/build**
- Run `npm test` and ensure all tests pass.

**Step 2: Rebase and resolve conflicts**
- Run `git fetch origin main` and `git rebase origin/main`.

**Step 3: Commit and create PR**
- Push feature branch and open PR with summary/tests.

**Step 4: Verify PR checks**
- Wait for checks, fix failures if any, and re-push.
