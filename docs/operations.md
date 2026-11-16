# Operations

## Environments

| | Local | Hosted (pilot) |
|---|---|---|
| Database / Auth | `supabase start` (Docker) | Supabase project, region **Central EU (Frankfurt)** — confirm availability at creation |
| Web | `npm run dev` | Static host (provider not yet chosen; Cloudflare Pages is a candidate) |
| Emails | Inbucket http://127.0.0.1:54324 | Configure custom SMTP in Auth settings (the built-in sender is rate-limited) |

Keep separate Supabase projects for staging and production.

## Deploying the backend

```bash
supabase link --project-ref <ref>
supabase db push                                   # applies supabase/migrations (NOT seed.sql)
supabase functions deploy invite-teacher
supabase secrets set ALLOWED_ORIGINS=https://<your-domain> INVITE_REDIRECT_URL=https://<your-domain>/auth/reset
```

In the Supabase dashboard:

- **Auth → URL configuration:** set the Site URL to `https://<your-domain>`. Add these redirect
  URLs: `https://<your-domain>/auth/callback` and `https://<your-domain>/auth/reset`.
- **Auth → Email:** keep confirmations on and set up custom SMTP.
- **API → Exposed schemas:** `public` only. `app_private` must not be listed.
- Keep the secret / `service_role` key only in the Edge Function's environment. It must never
  appear in the web host's variables, the companion, or Git.

The invitation link lands on `/auth/reset`, where the invited teacher sets a password. Their
teacher role was already granted by the function.

## Deploying the web app

```bash
cd web
VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key> npm run build
# upload web/dist; configure SPA fallback: all paths -> /index.html
```

The companion needs your production origin in its allow-list. Each teacher sets
`FLASHCLASS_ALLOWED_ORIGINS=https://<your-domain>`, or you ship that default in a packaged build.

## First administrator (bootstrap and recovery)

1. The person signs up in the app and confirms their email.
2. Edit the email in [`supabase/scripts/bootstrap_admin.sql`](../supabase/scripts/bootstrap_admin.sql),
   then run the script in the SQL editor. It runs as `postgres` and grants `teacher` and `admin`.
3. After that, add teachers from **Administration → Invite a teacher**, and other admins from
   **Users & roles**.

If every admin account is lost, the same script is the recovery path.

## Backups (the free plan has none)

- **Weekly:** `supabase db dump --linked -f backup-$(date +%F).sql` and
  `supabase db dump --linked --data-only -f data-$(date +%F).sql`. Store the dumps encrypted,
  outside the repository.
- **Restore drill:** load a dump into a fresh local stack with `psql` and run `supabase test db`.
- **Inactivity pausing:** free projects pause after about a week with no traffic. Unpause them
  from the dashboard. Don't promise users always-on service while on the free tier.

## Moderation runbook

- Reports appear in **Administration → Reports**. Aim to respond within an agreed time,
  for example 48 hours.
- **Hide** removes the material from the library at once and resolves its open reports.
- **Restore** returns it to the teacher unpublished. The teacher must re-attest that it's
  suitable for all ages before publishing again.
- Revoking a teacher's role takes effect immediately. Their already-published materials stay
  until hidden.

## Launch checklist

- [ ] Privacy notice reviewed by qualified local counsel (GDPR; minors and guardian consent
  in Bulgaria). Replace the draft text in `web/src/i18n/*` (`privacy.*`).
- [ ] Prohibited-content policy published, with a named owner for report response.
- [ ] Custom SMTP configured; invitation and password-reset emails tested end to end.
- [ ] `supabase test db` passes against the production schema (`supabase db pull`, then compare).
- [ ] The companion works from the **hosted HTTPS origin** in Chrome, Edge and Firefox.
  Document that Safari is unsupported for AI.
- [ ] Usage alerts set; free-tier limits (500 MB DB, 5 GB egress, pausing) documented for staff.
- [ ] Backup and restore drill completed once.
- [ ] Accessibility pass (keyboard-only walkthrough, screen-reader spot check, contrast).
