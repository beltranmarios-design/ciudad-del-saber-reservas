<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Business rules live as pure functions in src/lib/mobility/rules.ts — keeps them testable and portable to a future backend.
- Only src/lib/mobility/storage.ts touches localStorage for domain data — single swap point for a real API.
- Every mutation goes through store.run (reload → op → save → setState) — never show success before persistence.
- Occupancy/availability are always derived from vehicles, never stored — avoids desynced counters.
- All UI strings go through src/lib/i18n.tsx (typed ES/EN keys) — missing translations fail typecheck.
- Project scope is frontend-only: no Cloud/Supabase/server functions — required by the client brief.
- Stored data is versioned; schema/coherence changes ship as a non-destructive migration in storage.ts (migrateState) — never wipe user data.
