# Game Reporting

Personal game reports computed from existing `game_sessions.store` and `game_events` data. The architecture follows a plugin pattern: the platform owns the report shell (navigation, filters, data fetching) while each game plugin owns both the backend query logic and the frontend rendering.

## Architecture

```
Frontend                              Backend
────────                              ───────
AccountShell                          ReportController
  └─ ReportShellComponent               └─ ReportService
       ├─ Filter controls                     └─ GameReportRepository registry
       ├─ GAME_REPORT_PLUGINS registry              └─ SheepsheadReportRepository
       └─ NgComponentOutlet (dynamic)
            └─ SheepsheadReportComponent
```

### Data Flow

1. User navigates to `/user/reports`, selects a game type
2. Report shell renders filter controls from the selected `GameReportPlugin`
3. On filter change (debounced 300ms), shell calls `GET /api/reports/:gameType`
4. Controller authenticates, resolves the `GameReportRepository`, delegates
5. Repository queries `game_sessions` (store jsonb) and `game_events`
6. Full payload returned in a single response
7. Shell passes payload to the game plugin's report component via `NgComponentOutlet`

### Key Design Decisions

- **No new tables for metrics** — computed on-the-fly from `game_sessions.store` and `game_events`
- **Plugin owns both query and rendering** — each game provides a backend repository and frontend component
- **Single API call per report** — one GET returns the full payload
- **Personal reports only** — scoped to the authenticated user

## API

```
GET /api/reports/:gameType?variants=called-ace-5p,jack-of-diamonds&startDate=2024-01-01&endDate=2024-12-31
```

| Parameter | Type  | Required | Description                                       |
| --------- | ----- | -------- | ------------------------------------------------- |
| gameType  | path  | yes      | Game type key (e.g., `sheepshead`)                |
| variants  | query | no       | Comma-separated variant keys, or omit for all     |
| startDate | query | no       | ISO 8601 date (YYYY-MM-DD), inclusive lower bound |
| endDate   | query | no       | ISO 8601 date (YYYY-MM-DD), inclusive upper bound |

Requires authentication (`HttpAuthGuard`). Returns 401 if unauthenticated, 404 for unknown game types, 400 for invalid dates.

## Adding a New Game Report

### Backend

1. Create a repository class implementing `GameReportRepository` from `@cardquorum/shared`
2. Place it under the game's library in a `/reporting` secondary entrypoint
3. Register it in `ReportModule` via factory provider (no `@Injectable()` — keeps game libs decoupled from NestJS)
4. Add the game type key to `ReportService`'s repository map

### Frontend

1. Create a component that accepts the report payload via `input()`
2. Create a `GameReportPlugin` object with `label`, `variants`, and `getReportComponent()`
3. Register it in `GAME_REPORT_PLUGINS` (`apps/frontend/src/app/report/report-registry.ts`)

## File Locations

| Purpose               | Path                                               |
| --------------------- | -------------------------------------------------- |
| Shared types          | `libs/shared/src/lib/report-types.ts`              |
| Backend module        | `apps/backend/src/report/`                         |
| Sheepshead repository | `libs/games/sheepshead/src/reporting/`             |
| Frontend shell        | `apps/frontend/src/app/report/`                    |
| Sheepshead component  | `apps/frontend/src/app/game/sheepshead/reporting/` |
| Shared UI components  | `apps/frontend/src/app/shared/`                    |

## Variant Column

Game sessions store the config preset name in a dedicated `variant` column (varchar 100, nullable) rather than inside the `config` jsonb. This enables efficient filtering without jsonb path queries.

Migration `0010_add_variant_column.sql` handles the backfill from `config ->> 'name'` and removes the `name` key from config.

The `partnerDraft` boolean field in `SheepsheadConfig` replaces the old `config.name === 'partner-draft'` check for partner-draft variant detection.

## Known Issues

- **Pick-when-able metric**: The current implementation counts sessions where the user emitted a `pick` or `pass` event. This undercounts the denominator — it misses sessions where the user had the opportunity but the event data doesn't reflect it correctly. A better approach would derive opportunity from deal order and the picker's seat position in `store.players`. See the spec for the intended property definition.
