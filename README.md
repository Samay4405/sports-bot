# Automated Sports Slot Booking Agent

Full-stack app that schedules a Playwright bot to auto-book sports slots at a precise trigger time.

## Stack

- Frontend: React + Tailwind CSS + shadcn-style UI components
- Backend: Node.js + Express + Prisma + SQLite (local) / PostgreSQL (GitHub Actions) + node-cron + WebSocket
- Automation: Playwright (Chromium, headless)

## Project Structure

```text
sports-bot/
  frontend/
    src/
      components/
      pages/
  backend/
    src/
      routes/
      bot/
      scheduler/
      lib/
    prisma/schema.prisma
```

## Backend Features

- `POST /api/tasks` create/update task
- `GET /api/tasks` list tasks (password never returned)
- `DELETE /api/tasks/:id` delete task
- `POST /api/tasks/:id/run` test run now
- `GET /api/logs` run history with status + screenshot
- WebSocket endpoint `ws://localhost:4000/ws` for live step-by-step logs
- Cron manager re-registers jobs on startup and after task changes
- AES-256 encryption (GCM mode) for stored passwords

## Bot Behavior

- Smart login selector fallback: placeholder/name/aria-label/id/type
- Waits for visible selectors (`waitForSelector`) instead of fixed sleeps for page steps
- Retries slot detection every 2s for up to 2 minutes
- Stops immediately on login failure signals
- Aborts after 5 minutes global timeout
- Emits timestamped logs including exact `Date.now()` values
- Stores screenshot on successful booking

## Setup

### 1) Install Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
```

Create `backend/.env` from `backend/.env.example` and set:

- `DATABASE_URL` (local default: `file:./dev.db`)
- `ENCRYPTION_KEY` for password encryption/decryption

### 2) Install Frontend

```bash
cd ../frontend
npm install
```

Optional: create `frontend/.env` and set `VITE_API_URL` if backend differs from `http://localhost:4000`.

### 3) Start Services

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

## Task Configuration Flow

1. Enter website URL, username, password, sport, preferred slot time, trigger time.
2. Enable task and click **Save Task**.
3. Use **Run Now (Test)** to validate selectors and booking path immediately.
4. Observe real-time logs in the dashboard.
5. Review history table for status and screenshot proof.

## Single Morning Trigger Pattern

You do not need multiple trigger times.

- Set one morning trigger time, such as `04:50` IST.
- Save as many tasks as you want with that same trigger time.
- When that trigger fires, the scheduler runs every enabled task that matches it, one by one.
- Each task still books its own configured sport and preferred slot time.

## Notes for Real Websites

- Different websites have different DOM structures. The bot includes fallback selectors but you may need custom selectors for your campus portal.
- If MFA or CAPTCHA is enabled, fully automated booking may fail unless your institution allows bot-compatible flows.

## GitHub Actions Scheduling (5:00 AM IST)

This repo includes [scheduled.yml](.github/workflows/scheduled.yml), which runs daily at **04:50 IST** using UTC cron:

- 04:50 IST = 23:20 UTC (previous day)
- Cron used: `20 23 * * *`

Manual testing from Actions tab is also supported with optional inputs:

- `run_target_ist_hhmm`: Override matching time in `HH:MM`
- `run_only_task_id`: Run only one specific task ID
- `ignore_trigger_time`: If `true`, skip trigger-time matching and run filtered task(s) immediately

### Required GitHub Secrets

Add these in your repository settings:

- `ENCRYPTION_KEY` (must match the key used when passwords were encrypted)
- `DATABASE_URL` (database accessible from GitHub runner)

### Important Limitation

If your tasks are stored only in a local SQLite file on your laptop, GitHub Actions cannot access them.
To make cloud scheduling actually work, use a shared database reachable from GitHub runners (for example, hosted PostgreSQL) and point `DATABASE_URL` to it.

## Hosted Database Notes

Recommended providers: Neon, Supabase, Railway PostgreSQL, Render PostgreSQL.

One-time setup:

1. Create hosted PostgreSQL database.
2. Put its URL in `backend/.env` as `DATABASE_URL`.
3. Run:

```bash
cd backend
npm run prisma:generate:postgres
npm run prisma:deploy:postgres
```

4. Save tasks from dashboard so they are written to hosted DB.
5. Add the same `DATABASE_URL` and `ENCRYPTION_KEY` to GitHub repository secrets.

## Dual Prisma Schemas

- Local app uses SQLite schema: `backend/prisma/schema.prisma`
- GitHub Actions uses PostgreSQL schema: `backend/prisma/postgres/schema.prisma`

Useful commands:

- Local SQLite client: `npm run prisma:generate:sqlite`
- GitHub/PostgreSQL client: `npm run prisma:generate:postgres`
- GitHub/PostgreSQL migrations: `npm run prisma:deploy:postgres`

### Safe Manual Test Example

In GitHub Actions, run `Scheduled Sports Booking` with:

1. `run_only_task_id` set to one task id
2. `ignore_trigger_time` set to `true`
3. `run_target_ist_hhmm` left empty

This executes only that one task immediately and avoids triggering all due tasks.
