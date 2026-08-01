Add baseline security hardening to server/src/index.ts:
1. Add security headers via a middleware (e.g. helmet) — install it if not already present.
2. Add basic rate limiting on /api/* (e.g. express-rate-limit) to reduce abuse risk, especially important now that the app is publicly reachable.
This is additive to the shared-secret gate already in place, not a replacement for it.
