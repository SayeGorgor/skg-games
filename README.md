# SKG Games

**A collection of daily browser puzzles built for quick, satisfying challenges.**

[**Play SKG Games**](https://skg-games.vercel.app/) · [**Source code**](https://github.com/SayeGorgor/skg-games)

SKG Games combines interactive puzzle design with a full-stack system for publishing daily challenges, tracking results, and preserving progress. Visitors can play without an account; signed-in players can keep their game history associated with their profile.

## Games

### Daily Alibi

A daily logic mystery. Read a case, review suspects and clues, and make one accusation. Cases use curated story content with defined evidence, solutions, and explanations.

### Perfect Stack

A spatial puzzle where every piece must fit into the board. Drag, rotate, and arrange pieces to fill the grid, with multiple board sizes and interactive controls for testing solutions.

## Features

- **Two distinct puzzle experiences:** logic-based deduction and spatial problem-solving.
- **Daily challenges and practice play:** new puzzles on a daily schedule, with additional play options.
- **Guest-friendly design:** browser-local progress without mandatory sign-up.
- **Accounts and statistics:** authentication, completed-game history, and account-associated results, including synchronization of eligible guest progress.
- **Responsive interface:** layouts for mobile, tablet, and desktop, plus persistent light/dark themes.
- **Game-specific interactions:** placement, rotation, undo/reset, timers, solution checks, and completion feedback where applicable.
- **Persistent data:** relational models for daily content, attempts, streaks, profiles, and related account state.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Application | Next.js 16 (App Router), React, TypeScript |
| UI | Tailwind CSS 4, custom CSS and responsive layouts |
| Database | PostgreSQL (Neon), Drizzle ORM |
| Authentication | Neon Auth |
| Validation and tests | Vitest, Playwright-based browser verification scripts, ESLint |
| Hosting and scheduling | Vercel, scheduled API route |

## Engineering Highlights

**Daily content lifecycle.** Daily Alibi cases are maintained as an authored catalog, validated, and assigned to calendar dates. The daily publishing workflow is designed to be repeatable without producing duplicate content. Game-date handling uses the `America/New_York` timezone to keep challenge turnover consistent across daylight saving changes.

**Progress across guest and authenticated sessions.** Browser-local results keep free play accessible. The application also provides account-based history and synchronization while keeping user identity and game data in separate layers.

**Server-side persistence and verification.** Drizzle models and application API routes support challenge retrieval and completion persistence, with game-specific validation and tests for important state transitions.

## Project Structure

```text
skg-games/
├── src/               # Next.js app, components, game logic and server code
├── drizzle/           # Database migrations
├── scripts/           # Content generation and verification utilities
├── docs/              # Implementation and test notes
├── public/            # Static assets
└── package.json
```

## Run Locally

**Requirements:** Node.js and npm. Database-backed features additionally require a properly configured development Neon/PostgreSQL environment; authentication requires a development Neon Auth configuration.

```bash
git clone https://github.com/SayeGorgor/skg-games.git
cd skg-games
npm ci
```

If an `.env.example` file is present, use it as a reference to create `.env.local` with your **own development credentials**. Not every production feature is available without the corresponding external service.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Quality checks

```bash
npm test
npm run lint
npm run build
```

For a **disposable development database only**, the repository also includes Drizzle commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Review the migration and seeding documentation in [`docs/`](./docs/) before running commands against any persistent database. Never reuse production credentials for local experimentation.

## Daily Challenge Publishing

The application includes a protected, idempotent endpoint at `/api/cron/publish-daily`. Its deployment schedule accounts for Eastern Time midnight during both standard time and daylight saving time. Protected invocation requires a server-side `CRON_SECRET`; do not expose that value in client-side code.

## Status

SKG Games is actively developed. Some authentication, subscription, advertising, and operational integrations depend on environment configuration and may vary between local and deployed setups.

**Built by [Saye Gorgor](https://github.com/SayeGorgor).**


## Technical documentation

- [Architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), and [authentication](docs/AUTHENTICATION.md)
- [Daily content](docs/DAILY-CONTENT.md), [puzzle generation](docs/PERFECT-STACK-V2.md), and [game history](docs/GAME-STATISTICS.md)
- [Responsive design and accessibility](docs/RESPONSIVE.md)
