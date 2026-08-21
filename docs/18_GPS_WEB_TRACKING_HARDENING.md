# GPS web tracking hardening

## Operating boundary

- Browser tracking is an explicit, foreground-only action for an assigned driver or helper while a delivery job is `in_transit`.
- Closing the tab, denying browser location permission, or OS background throttling stops reliable updates. The UI must say this plainly.
- Customers see their own active deliveries after login. A public link is optional, created or revoked only by Owner, Administrator, Dispatcher, or Supervisor with a delivery permission.

## Privacy and retention

- Public/customer maps receive a 50-metre rounded location and at most 24 accepted recent points. They never receive the employee identity or internal data.
- Links use a random 256-bit token, only store its SHA-256 hash, expire after four hours, and are invalid when the delivery is no longer `in_transit`.
- Raw coordinates are retained for 90 days after the session stops. The retention job deletes points and latest coordinates but retains event summaries for audit.

## Production cutover

1. Apply `202607280001_delivery_tracking_web_hardening.sql` to a dedicated staging project.
2. Verify the legacy `delivery_tracking` runtime document can be exported and reconciled by session count, point count, latest point, and active session per job.
3. Load the reconciled snapshot into `delivery_tracking_sessions`, `delivery_tracking_points`, and `delivery_tracking_events` in one maintenance window. Do not dual-write.
4. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` in Vercel. Production fails closed rather than using the file store.
5. Confirm RLS with an assigned driver, unrelated driver, customer, dispatcher, and anonymous public-link request before enabling traffic.

## Retention job

Vercel invokes `/api/internal/cron/tracking-retention` daily at `20:15 UTC` (`03:15` Asia/Bangkok). Vercel must send `Authorization: Bearer $CRON_SECRET`.
Use `?dryRun=1` only with the same secret to inspect counts before a manual purge.
