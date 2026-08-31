# Ana Farma DEV — Next Step

## Status
- Diagnostic V3: PASS 15/15 (reported from Apps Script Development runtime on 2026-08-31).
- Do not deploy to Production until transaction integration tests pass.

## Integration target
The audited Code.gs transaction route uses `createTransaksiV2` behind `withUser`/`routePost`. Do not replace the legacy `createTransaksi()` merely by line number. Integrate the new engine at the actual V2 route after confirming the current source.

## Required validation sequence
1. Static syntax validation.
2. Pure calculation tests for PCS/BOX.
3. Server-authoritative price/factor validation.
4. Insufficient-stock no-mutation test.
5. Duplicate request/idempotency test.
6. Failure/rollback test.
7. Cancellation reversal test.
8. Shift accounting and human date/time test.
9. Offline retry test.
10. Production regression review.

## Safety
No production deployment or real-stock mutation should occur during the integration stage.
