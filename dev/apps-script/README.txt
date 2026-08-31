ANA FARMA — Apps Script backend V2

This directory documents the audited backend source that must be copied into the separate Google Apps Script project.

Required files:
- Code.gs: audited backend source from the current uploaded project + Sales V2.
- offline-sync.js: durable Offline_Sync helper.
- appsscript.json: Asia/Makassar + V8 configuration.

Deployment sequence:
1. Make a backup/version of the current Apps Script project.
2. Replace Code.gs with the audited Code.gs supplied in the V2 bundle.
3. Replace offline-sync.js with the audited offline-sync.js.
4. Keep the existing SetupSheets.gs and other project files unless they conflict with the documented headers.
5. Run diagnosticPenjualanV2() once from Apps Script editor.
6. Confirm Detail_Transaksi contains the four V2 columns:
   Satuan_Jual, Qty_Satuan_Jual, Konversi_Ke_Dasar, Harga_Satuan_Jual.
7. Confirm Offline_Sync exists and contains ResultJson.
8. Deploy a new DEV web-app version, not Production.
9. Test PCS, BOX, insufficient stock, payment shortage, duplicate requestId, offline retry, and shift timestamp.

The backend is intentionally not auto-deployed from GitHub because the live Apps Script project is a separate resource.
