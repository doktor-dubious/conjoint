# conjoint-web

React + Vite + TS + Tailwind + shadcn frontend.

## Routes

| Path                              | Page              | Notes                              |
|-----------------------------------|-------------------|------------------------------------|
| `/`, `/surveys`                   | SurveyListPage    | list + links                       |
| `/surveys/new`                    | SurveyNewPage     | create survey + auto-generate design |
| `/surveys/:id`                    | SurveyDetailPage  | objects, designs, generate, CSV    |
| `/surveys/:id/participate`        | ParticipantPage   | slider per trial, no nav chrome    |
| `/surveys/:id/results`            | ResultsPage       | aggregate + per-respondent OLS     |
| `/scan`                           | ScanPage          | stateless variance scan            |

## Run locally

```bash
cd web
npm install
npm run dev    # http://localhost:5173 (proxies /api -> localhost:8000)
```

## Run via Docker Compose (from project root)

```bash
docker compose up --build       # web on :5173, api on :8000, db on :5432
```

## Build

```bash
npm run build
```

## Project layout

```
src/
├── main.tsx, App.tsx, index.css
├── lib/
│   ├── api.ts            # typed fetch client (all backend routes)
│   └── utils.ts          # cn() helper
├── components/
│   └── ui/               # shadcn primitives: button, input, label, card
└── pages/
    ├── ScanPage.tsx
    ├── SurveyListPage.tsx
    ├── SurveyNewPage.tsx
    ├── SurveyDetailPage.tsx
    ├── ParticipantPage.tsx
    └── ResultsPage.tsx
```
