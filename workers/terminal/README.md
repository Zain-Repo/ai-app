# Terminal execution worker

This worker gives the AI model a non-interactive terminal without running user
commands in Convex or the web application. It uses the open-source
[gVisor `runsc` runtime](https://gvisor.dev/docs/user_guide/quick_start/docker/)
as the container isolation boundary and has no paid service dependency.

## Security boundary

- Run this worker on a dedicated Linux host, separate from the web and Convex
  processes.
- Install and configure `runsc` as a Docker runtime. The health endpoint returns
  `503` when Docker, the sandbox image, or the selected runtime is unavailable.
- Never replace `runsc` with the ordinary `runc` runtime in production.
- The worker launches containers with no network, a read-only root filesystem,
  all Linux capabilities dropped, `no-new-privileges`, and CPU, memory, PID,
  open-file, per-file size, command-time, and output limits.
- The Docker socket remains only on the trusted worker host. It is never mounted
  into a sandbox.
- The API binds to loopback by default. Put authenticated TLS infrastructure in
  front of it when Convex reaches it over a network; do not expose it publicly.
- Do not place credentials in a workspace. V1 deliberately rejects per-command
  environment variables and provides no network access.

Project workspaces keep their Docker volume and stopped containers restart on
demand. Ordinary chat workspaces and their volumes are deleted after 30 minutes
of inactivity. Deleting a chat or project also schedules best-effort cleanup.

## Build and run

```sh
docker build -t dev3-terminal:local workers/terminal/image
export TERMINAL_WORKER_TOKEN='replace-with-at-least-32-random-characters'
bun run terminal:worker
curl http://127.0.0.1:8788/health
```

In production, build and scan the image in CI, then set
`TERMINAL_SANDBOX_IMAGE` to an immutable internal image digest.
Place Docker's data root on a dedicated filesystem with an enforced project
quota as well; Docker does not provide a portable aggregate-size limit for
ordinary persistent named volumes.

Configure the Convex deployment with the matching `TERMINAL_WORKER_TOKEN` and
an HTTPS `TERMINAL_WORKER_URL`. If both values are absent, the model is not
offered the terminal tool. A partially configured or unavailable worker fails
closed; there is no host-execution fallback.

Optional worker settings:

- `TERMINAL_CONTAINER_RUNTIME` (default `runsc`)
- `TERMINAL_WORKER_HOST` and `TERMINAL_WORKER_PORT`
- `TERMINAL_WORKER_STATE_DIR`
- `TERMINAL_COMMAND_TIMEOUT_MS` (default 120 seconds)
- `TERMINAL_CHAT_IDLE_MS` (default 30 minutes)
- `TERMINAL_PROJECT_STOP_IDLE_MS` (default 10 minutes)

V1 does not include interactive PTY access, outbound network approvals,
credential injection, artifact export, or checkpoint/restore APIs.
