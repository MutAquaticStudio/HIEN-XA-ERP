# Android security foundation

## Implemented

- The embedded ERP and admin map use one origin derived from the server bridge.
  The app blocks popups, mixed content, third-party cookies, persistent cache
  and navigation outside that origin.
- Native background tracking is opt-in per delivery. It requires a driver,
  `in_transit` status and a server-provided eligible job before Android location
  permissions are requested.
- The policy version and acceptance time are retained in SecureStore only while
  tracking is active. Stop, logout, missing mobile session or a 401 from a GPS
  request clears consent, context and queued points.
- A native start does not create or share a public customer tracking link.

## Remaining production gates

- Persist consent and its audit event server-side only after the normalized
  PostgreSQL tracking repository and RLS cutover are available on staging.
- Replace the legacy mobile bearer issuer with Supabase Auth during the approved
  identity cutover. Do not run dual identity sources.
- Add encrypted offline storage, EAS credentials, Expo push credentials, Sentry
  DSN and physical-device UAT outside source control.
