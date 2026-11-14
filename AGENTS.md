<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Orbit project notes

- Orbit is the internal platform of AS Groups · Digital Marketing. Never name "Orbit" in client-facing copy.
- All WhatsApp sending goes through `src/lib/send.ts` → the messaging adapter. Don't call Meta's API from features directly.
- Ground rules are enforced in code: no review gating (same link to everyone), consent required, STOP/வேண்டாம் ends messages, nothing 20:00–9:00, owner approves anything published in their name.
- Every customer-data table carries `business_id` with row-level security; keep it that way for new tables.
- Pin the Graph API version (`GRAPH_API_VERSION`); upgrade deliberately.
