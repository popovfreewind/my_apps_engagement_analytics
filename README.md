## Google Apps Script Engagement Importer

This project contains an engagement-only pipeline in one Apps Script project.

- Engagement data writes to tab: `engagement_daily_db`

The tab is in the bound spreadsheet (`SpreadsheetApp.getActiveSpreadsheet()`).

## Account and clasp

Use the correct Google account:

- analytics.freewindsoftware@gmail.com

Commands:

```bash
clasp login
clasp pull
clasp push
```

## Entry points

- `proceedEngagementImport()`
	- Imports engagement ZIP CSVs into `engagement_daily_db`.
- `runAllAnalytics()`
	- Higher-level entry point that runs the engagement import.
- `proceedEngagementImportBatch()`
	- Batch entry point for scheduled triggers (processes one thread per run).
- `runAllAnalyticsBatch()`
	- Batch orchestrator for engagement import.

## Maintenance entry points

- `removeEngagementDuplicates()` for engagement (`row_key` key)

## Naming and file structure

- `analytics_config.js`: engagement constants (`ENGAGEMENT_*`) and sheet layout constants
- `engagement_import.js`: engagement ZIP/CSV importer
- `main.js`: public entry points and orchestration
- `utils.js` + dedup helper: shared utilities

## Operational notes

- Processed threads are marked as read and moved to trash.
- Re-running should append zero rows for already imported keys.