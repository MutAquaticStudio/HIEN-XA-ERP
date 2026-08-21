# Mobile native authentication boundary

## Applied

- Every `/api/mobile/*` route now requires a Bearer identity and cannot inherit
  a browser cookie. Browser endpoints retain their explicit same-origin checks.
- The regression suite covers both rejection of a cookie-only request and actor
  creation from a verified bearer identity.

## Not complete yet

- The current bearer token is the existing server-issued identity token. It is
  not Supabase Auth until the approved cutover completes.
- WebView origin lock-down, versioned tracking consent with server audit,
  encrypted native queue, EAS and Sentry remain separate pilot work items.
- No migration, cutover, secret activation or production deployment is implied
  by this hardening change.
