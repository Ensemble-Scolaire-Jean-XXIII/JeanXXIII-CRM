# CRM Application

A modular, self-hosted Customer Relationship Management (CRM) system designed to manage prospects, automate email workflows, and synchronize data with external sources.

## Overview

This project is structured as a monorepo containing both the frontend client and the backend API. It relies entirely on Docker for both development and production environments, eliminating the need for local Node.js or database installations.

## Architecture & Tech Stack

### Frontend (`/frontend`)

- **Framework:** Next.js (React)
- **Language:** TypeScript
- **Styling:** Tailwind CSS

### Backend (`/backend`)

- **Framework:** Express (Node.js)
- **Language:** TypeScript
- **Database:** MariaDB 10.11

### Infrastructure

- **Containerization:** Docker & Docker Compose
- **Task Automation:** Makefile
- **Network (Production):** Cloudflare Tunnel (Zero Trust) for secure public access.

## Prerequisites

- Docker and Docker Compose plugin installed.
- `make` utility installed on your host machine.
- A Cloudflare account (for production deployment).

## Environment Configuration

You need to set up environment variables for the containers to run correctly.

Create a `.env` file for development and a `.env.prod` file for production at the root of the repository. Include the following necessary keys in both files, adjusting values appropriately for the target environment:

```env
# Dev only
FRONTEND_PORT=3000
BACKEND_PORT=5000
DB_PORT=3306
NEXT_PUBLIC_API_URL=

# Prod + Dev
MYSQL_ROOT_PASSWORD=
MYSQL_DATABASE=
MYSQL_USER=
MYSQL_PASSWORD=

JWT_SECRET=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

LEXPRESS_API_URL=
LEXPRESS_USER=
LEXPRESS_API_KEY=
```

## Development Workflow

The development environment uses Docker volume mounts to enable hot-reloading. You do not need to install local dependencies.

Use the provided `Makefile` to manage the development lifecycle:

- **`make dev-build`**: Builds the development Docker images.
- **`make dev-up`**: Starts the database, backend, and frontend containers in the background. The backend waits for the database healthcheck to pass before starting.
- **`make dev-logs`**: Displays real-time logs for all development containers.
- **`make dev-down`**: Stops and removes the development containers.

Once running, the frontend is accessible at `http://localhost:<FRONTEND_PORT>` and the API at `http://localhost:<BACKEND_PORT>`.

## Production Deployment & Cloudflare Zero Trust

The production setup relies on optimized, multistage Docker builds and a secure Cloudflare Zero Trust architecture. Containers attach to an external `proxy-net` network and publish **no host ports**; a dedicated reverse proxy (managed outside this repository) terminates HTTPS and forwards traffic to the app.

### Production Images (Optimized, Multistage)

Each service ships its own production `Dockerfile.prod` together with a `.dockerignore` that keeps the build context small. Both images are built in separate stages so the runtime only contains what is strictly needed:

- **Backend** — TypeScript is compiled ahead of time (`npx tsc -p . --outDir dist --rootDir .`) and the runner executes `node dist/index.js`. Dev-only dependencies are pruned (`npm prune --omit=dev`), the app runs as the unprivileged `node` user, and `public/` is copied so the email signature (`signature.png`) keeps working. Image: ~265 MB virtual (~155 MB of runtime content) instead of ~368 MB.
- **Frontend** — built with Next.js standalone output (`output: "standalone"` in `frontend/next.config.ts`). Only the standalone runtime, static assets and `public/` are copied into the runner. Image: ~250 MB virtual (~51 MB of runtime content) instead of ~846 MB.

`docker-compose.prod.yml` references the `Dockerfile.prod` files explicitly for both services.

### 1. Launch Production Containers

Use the `Makefile` to build and start the production stack:

- **`make prod-build`**: Builds the production Docker images.
- **`make prod-up`**: Starts the production containers.
- **`make prod-logs`**: Displays real-time logs.
- **`make prod-down`**: Stops the production containers.

Changes pushed to `main` are deployed automatically by the `CD - Deploy CRM Production` GitHub Actions workflow (self-hosted runner: `git pull` → `make prod-down` → `build --no-cache` → `make prod-up` → `docker image prune -f`).

### 2. Configure Cloudflare Zero Trust

To safely expose the CRM to the internet without opening router ports or exposing your host IP:

1. Install the `cloudflared` daemon on your host server.
2. Authenticate `cloudflared` with your Cloudflare account.
3. Create a new Zero Trust Tunnel via the Cloudflare Dashboard or CLI.
4. Configure the tunnel's Public Hostname to route traffic to your local reverse proxy, which forwards to the production frontend:

- **Public Hostname:** `crm.yourdomain.com`
- **Service:** `http://localhost:<proxy-port>`

5. Apply Zero Trust policies (e.g., Email OTP, Access Groups) in the Cloudflare Dashboard to restrict access to the CRM interface.

## Maintenance & Best Practices

To keep the repository clean and avoid breaking production, follow these maintenance guidelines:

### 1. Managing Dependencies & Dependabot

- **Major Updates Caution:** Be extremely careful with major version updates (e.g., updating TypeScript or core libraries). Tools like `ts-node` used in the backend can break with major TypeScript version jumps.
- **Test Before Merge:** Always test builds locally (`npm run build` for frontend, checking execution for backend) before merging Dependabot PRs.
- **Isolate Deployments:** When merging grouped dependency PRs, merge them one by one and verify that the CI/CD pipeline and production containers remain healthy before proceeding with the next.

### 2. Hotfix Workflow (`hotfix/prod`)

- **No Sync Pushes:** Do **not** push simple synchronization commits (such as `git merge main` followed by a `git push`) directly to the remote `hotfix/prod` branch if you use automated GitHub Actions to open hotfix PRs. Doing so will unnecessarily trigger and recreate redundant/ghost pull requests.
- **Pushes Reserved for Code:** The `hotfix/prod` remote branch should only receive pushes when you are actively writing and submitting a genuine code correctif (hotfix). Use local merges only if you need to synchronize your local working branch.
- **Clean branches after a new feature got deployed**: `git branch | grep -vE "main|hotfix/prod" | xargs git branch -D && git fetch --prune`

## Customization and Adoption

This CRM is designed as a foundational template.

1. **Data Models:** Modify the SQL schema and TypeScript interfaces (`backend/models/types.ts` and `frontend/types/index.ts`) to track specific lead attributes.
2. **Email Templates:** Update the regex parser (`utils/templateParser.ts`) to inject your specific business logic and variables into email campaigns.
3. **External Integrations:** Adapt the synchronization service (`backend/services/lexpressService.ts`) to fetch data from your specific lead generation sources.
