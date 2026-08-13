import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

const customerPortal = migration("202607240001_customer_portal_access.sql");
const tracking = migration("202607220001_delivery_live_tracking.sql");
const push = migration("202607260001_push_notifications.sql");
const communications = migration("202607260002_partner_communications.sql");
const attachments = migration("202607260004_private_operations_attachments.sql");

describe("partner and platform Supabase migrations", () => {
  it("restricts customer portal records to the customer linked to the authenticated user", () => {
    expect(customerPortal).toContain("add column if not exists customer_id uuid references public.customers");
    expect(customerPortal).toContain("create unique index if not exists app_users_customer_id_unique_idx");
    expect(customerPortal).toContain("create or replace function public.current_customer_id()");
    expect(customerPortal).toContain("customer_id = (select public.current_customer_id())");
    expect(customerPortal).toContain("customer_self_read_customer_ledger");
  });

  it("keeps supplier chat server-managed, party-scoped and idempotent", () => {
    expect(communications).toContain("add column if not exists supplier_id uuid references public.suppliers");
    expect(communications).toContain("create or replace function public.current_supplier_id()");
    expect(communications).toContain("create or replace function public.can_access_partner_thread");
    expect(communications).toContain("unique (thread_id, idempotency_key)");
    expect(communications).toContain("partner_threads_scoped_read");
    expect(communications).toContain("partner_messages_scoped_read");
  });

  it("stores push subscriptions per user and does not expose the delivery outbox to browser roles", () => {
    expect(push).toContain("unique (user_id, channel, endpoint)");
    expect(push).toContain("push_subscriptions_self_select");
    expect(push).toContain("push_subscriptions_self_delete");
    expect(push).toContain("alter table public.push_notification_outbox enable row level security");
    expect(push).toContain("Failed gateway delivery must not roll back business commands");
  });

  it("keeps GPS tracking links opaque, point writes idempotent and reads assignment-scoped", () => {
    expect(tracking).toContain("public_token_hash text not null unique");
    expect(tracking).toContain("unique (session_id, client_point_id)");
    expect(tracking).toContain("delivery_tracking_one_active_session_per_job");
    expect(tracking).toContain("assigned_or_delivery_roles_read_tracking_sessions");
    expect(tracking).toContain("grant all on public.delivery_tracking_sessions, public.delivery_tracking_points, public.delivery_tracking_events to service_role");
  });

  it("creates a private evidence bucket instead of public object storage", () => {
    expect(attachments).toContain("values ('erp-attachments', 'erp-attachments', false)");
    expect(attachments).toContain("set public = false");
  });
});
