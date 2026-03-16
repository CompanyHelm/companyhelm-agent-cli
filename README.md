# @companyhelm/agent-cli

Deprecated. The supported agent integration path is the self-discoverable REST API at `/agent/v1`, not this CLI.

The runner now writes the resolved agent API URL and thread secret into `agents.md`. If an agent needs contract details, fetch them from the API directly:

```bash
export AGENT_API_URL="<agent-api-url>"
export AGENT_SECRET="<thread-secret>"

curl -H "Authorization: Bearer ${AGENT_SECRET}" "${AGENT_API_URL}/"
curl -H "Authorization: Bearer ${AGENT_SECRET}" "${AGENT_API_URL}/docs"
curl -H "Authorization: Bearer ${AGENT_SECRET}" "${AGENT_API_URL}/openapi.json"
```

This package remains in the repository only as a legacy artifact.

## Legacy CLI

Non-interactive npm TypeScript CLI wrapper around `AgentTaskService`.

## Command Name

- `companyhelm-agent`

## Config

Default config path:

```text
~/.config/companyhelm-agent-cli/config.json
```

Required config fields:

```json
{
  "agent_api_url": "127.0.0.1:50052",
  "token": "your-agent-token"
}
```

`agent_api_url` has no default value and must be set in the config file.

## Auth Model

- `token` must be a **thread secret** for AgentTask gRPC authentication.
- Preferred replacement: use the REST API with `Authorization: Bearer <thread-secret>`.
- `token` is **not** a JWT.
- Reference: [Auth Matrix](https://github.com/CompanyHelm/companyhelm-api/blob/main/docs/auth-matrix.md)

For local smoke tests, you can generate a thread secret from the API repo:

```bash
cd /workspace/companyhelm-api
npm run db:seed:agent-cli
```

Use the printed `agentCliConfig` JSON in `~/.config/companyhelm-agent-cli/config.json`.

## Task Commands

```bash
companyhelm-agent task create --name <name> [--description <text>] [--acceptance-criteria <text>] [--assignee-principal-id <id>] [--parent-task-id <id>]
companyhelm-agent task get --task-id <id>
companyhelm-agent task add-dependency --task-id <id> --dependency-task-id <id>
companyhelm-agent task dependencies --task-id <id>
companyhelm-agent task dependent --task-id <id>
companyhelm-agent task subtasks --task-id <id>
companyhelm-agent task comments --task-id <id>
companyhelm-agent task update-status --task-id <id> --status <draft|pending|in_progress|completed>
companyhelm-agent task add-comment --task-id <id> --comment <text>
```

## Output Contract

- Success: JSON payload on `stdout`
- Failure: JSON error payload on `stderr`
- Exit code: non-zero on failure

## Publish

Publishing to [@companyhelm/agent-cli](https://www.npmjs.com/package/@companyhelm/agent-cli) is automated by GitHub Actions:

```bash
npm version patch|minor|major
git push --follow-tags
``` 

Then push changes, this will publish a new package with the version already bumped.
