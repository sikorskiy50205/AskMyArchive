# AskMyArchive — Web UI

Next.js frontend for the AskMyArchive API.

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui
- next-intl — Russian/English UI, locale stored in a cookie
- next-themes — dark/light theme
- TanStack Query — server state, Zustand — auth session
- react-hook-form + zod — form validation

## Run locally

1. Start the API (see repository README): `dotnet run --project src/AskMyArchive.Api`
2. Copy `.env.example` to `.env.local` (defaults point at `http://localhost:5014`).
3. Install and run:

```bash
npm install
npm run dev
```

The app is served at http://localhost:3000.
