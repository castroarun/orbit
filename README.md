# Orbit

Internal platform behind **AS Groups · Digital Marketing**. "Orbit" is an internal name only; client-facing material says "our own platform".

**Stage 2 (in progress): the review engine.** Screens follow the frozen app mockup:

- **Overview** (`/`): every client business with customers, requests and taps this month, plus what needs attention. All counted from the database.
- **Businesses** (`/businesses`): add and edit clients (area, type, owner's WhatsApp for complaint alerts, Google review link, Place ID, languages, status, plan).
- **Customers** (`/customers?b=<business>`): search, stage filters, add a customer (consent is a separate unticked box), and a side panel with the customer's story, Record a visit, Record consent, Stop all messages.
- **Review sequence**: "Visit done: ask for a review" on a customer → check-in (no link) → review link with a tracked short link (`/r/<code>`) after a reply or a wait → one reminder if not tapped → thank-you on the first tap. Steps are rows in `orbit.jobs`; Supabase calls `/api/cron/tick` once a minute (migration 0004). **Test mode** on a business sends everything to a test phone through our Meta test number, with minute-long waits.
- **Import** (`/import?b=<business>`): Excel (.xlsx) or CSV; columns matched from the headings; checks numbers (+91 added), duplicates, invalid numbers, future dates and consent before saving. Existing customers are filled in, never overwritten. Nothing is sent.

**Stage 1: the approval kit** (under "Meta test tools" in the sidebar). The bare minimum Meta needs to see before approving us as a WhatsApp Tech Provider:

- **Send test** (`/send`): sends a WhatsApp message from Meta's free test number (App Review video 1). It can also produce a one-tap wa.me link, which is the pilot mode.
- **Templates** (`/templates`): creates a message template and submits it to Meta, then shows its approval status (App Review video 2).
- **Messages** (`/messages`): everything sent and received, with delivery ticks. Replies arrive through the webhook.
- **Webhook** (`/api/webhooks/meta`): checks Meta's signature, stores incoming messages and delivery statuses, records template approvals, and handles STOP / வேண்டாம்.
- **Privacy** (`/privacy`) and **Terms** (`/terms`): Meta's App Review needs these. They're drafts; our advocate partner should review them.

The database schema already covers all of module 1 (the review engine), so stage 2 builds on it.

## How it's put together

| Piece | Where |
|---|---|
| Messaging adapter: the one place that sends (`wame`, `meta`, `provider` modes) | `src/lib/messaging/` |
| Ground rules: consent, STOP, quiet hours 20:00–9:00 | `src/lib/messaging/rules.ts` |
| Meta Graph API, templates, webhook parsing, signature check | `src/lib/meta/` |
| Send + log in one call | `src/lib/send.ts` |
| Database schema with row-level security | `supabase/migrations/` (run in order: 0001 to 0004) |
| Login gate (Next 16 `proxy.ts`, formerly middleware) | `src/proxy.ts` |

### Where do I change X

| Change | File |
|---|---|
| Colours, fonts, radii, buttons, pills | `src/app/globals.css` (tokens at the top) |
| Sidebar menu (add or rename a screen) | `src/lib/nav.ts` |
| Business form rules, review-link logic, "missing setup" list | `src/lib/business.ts` |
| Consent wording ("Said yes at billing"…) | `src/lib/consent.ts` |
| Customer stage names and filters | `src/lib/customer-stage.ts` |
| Import column guesses, date/number/consent reading | `src/lib/import-check.ts` |
| Saving businesses, customers, visits, imports, starting review requests | `src/app/actions-crm.ts` |
| Review sequence waits (real and test), quiet-hour shifting, link codes | `src/lib/sequence/timing.ts` |
| Which template each step uses and its blanks | `src/lib/sequence/messages.ts` |
| Sequence engine: start, run due steps, taps, replies | `src/lib/sequence/engine.ts` |
| Stage-1 Meta actions (send, templates) | `src/app/actions.ts` |

Stack: Next.js 16 on Vercel, Supabase (Postgres, login, access rules), Meta WhatsApp Cloud API with the Graph API version pinned in `GRAPH_API_VERSION`.

## Setup (about an hour, once)

### 1. Supabase
All of Orbit's tables live in their own **`orbit` schema**, so Orbit can share a Supabase project with another app. For now it shares "castroarun's Project" (Mumbai) and never touches that app's `public` tables.

1. In **SQL Editor**, paste and run each file in `supabase/migrations/` in order (0001 to 0004). All are safe to re-run except 0001.
2. In **Integrations → Data API → Settings → Exposed schemas**, tick `orbit` and save.
3. Add yourself as a login under **Authentication → Users → Add user**. If you already have a login in that project, reuse it.
4. Give yourself agency access (SQL Editor). Logins without a row in `orbit.profiles` can't see anything in Orbit, so the other app's users are locked out automatically:
   ```sql
   insert into orbit.profiles (id, full_name, is_agency)
   select id, email, true from auth.users where email = 'you@example.com';
   ```
5. In **Project Settings → API Keys**, copy the URL, the publishable key and the secret key.

Don't turn off sign-ups in a shared project, because the other app may need them.

### 2. Meta app and test number (no business verification needed yet)
1. Go to developers.facebook.com → **My Apps → Create app**, and choose the WhatsApp use case.
2. Open **WhatsApp → API Setup**. Copy the **temporary access token**, the **Phone number ID** and the **WhatsApp Business Account ID**.
3. Under **To**, add your own phone number as a recipient. The test number only delivers to numbers you add here, up to 5.
4. Open **App settings → Basic** and copy the **App secret**.

The temporary token expires after 24 hours. For longer testing, create a system user token in Business Settings.

### 3. Vercel
1. Import `castroarun/orbit` into Vercel.
2. Add every value from `.env.example` under **Settings → Environment Variables**, then deploy.

### 4. Connect the webhook
1. In Meta, go to **WhatsApp → Configuration → Webhook**.
2. Set the callback URL to `https://<your-vercel-domain>/api/webhooks/meta`.
3. Set the verify token to the same value as `META_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe to **messages** and **message_template_status_update**.

### 5. Try it, then record the App Review videos
1. Log in and send `hello_world` to your phone. Reply from your phone, and the reply appears under Messages.
2. **Video 1:** record the screen while sending a message from Orbit, and show it arriving in WhatsApp.
3. **Video 2:** record the screen while creating a template in Orbit, and show it appearing as PENDING or APPROVED.
4. Submit the videos for App Review once AS Groups' business verification is done.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
```

## Next stages
- **Stage 2, still to build:** tracked short links (`/r/<code>`), daily rating check, the message schedule with one-tap sending, and the counter phone screen.
- **Stage 3 (after Meta approval):** Embedded Signup v4 with Coexistence, so clients connect their own number. Automatic sending, complaint detection, check-backs.
- **Stage 4 (after Google approval):** reviews read in, AI-drafted replies, owner approval.

The plan and decisions live in the "Digital Marketing Business" Claude project: `orbit-handoff.md`, `orbit-build-plan.md` and `review-engine.md`.
