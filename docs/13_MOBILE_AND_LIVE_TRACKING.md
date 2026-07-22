# Mobile app and live delivery tracking

## Client strategy

The native Android-first application is a secure companion client. It opens the existing responsive ERP in an authenticated WebView for complete module parity, while native screens own device capabilities: background location, secure token storage, sharing the customer tracking link and future push notifications/camera workflows.

## Tracking boundary

Only a driver or assigned helper may start a tracking session, and only while the delivery is `in_transit`. Points are append-only and idempotent by `(session_id, client_point_id)`. The server validates assignment, delivery status, coordinates and precision before persisting a point.

## Privacy and public links

Customer links contain an opaque 256-bit token. Only its hash is stored. The public endpoint exposes the delivery document, status and route points only; it never exposes employee identity, account data or other orders. Links expire automatically and are shortened after the tracking session stops.

## Mobile constraints

Location is started only after an explicit worker action, with a visible Android foreground-service notification. Device vendors and users can still stop a terminated app, so the app queues unsent points locally and resumes delivery after it reopens. GPS history requires an operational retention policy before production launch.
