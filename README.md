## Google Apps Script Engagement Importer

This project contains an engagement-only pipeline in one Apps Script project.

- Engagement data streams directly into BigQuery: `freewind-software.roku_analytics.engagement_daily`.

See `BIGQUERY_CONFIG` in `analytics_config.js` for the target project/dataset/table/location.

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
	- Imports engagement ZIP CSVs and streams new rows into BigQuery.
- `runAllAnalytics()`
	- Higher-level entry point that runs the engagement import.
- `proceedEngagementImportBatch()`
	- Batch entry point for scheduled triggers (processes one thread per run).
- `runAllAnalyticsBatch()`
	- Batch orchestrator for engagement import.

## Naming and file structure

- `analytics_config.js`: engagement constants (`ENGAGEMENT_*`) and BigQuery destination config (`BIGQUERY_CONFIG`)
- `engagement_import.js`: engagement ZIP/CSV importer, BigQuery existence check, and streaming insert
- `main.js`: public entry points and orchestration
- `utils.js`: shared date formatting, row_key building, and safe number parsing helpers

## Operational notes

- Processed threads are marked as read and moved to trash.
- Before inserting, the importer queries BigQuery for existing `row_key`s within the incoming batch's date range and only streams rows that aren't already present (see `fetchExistingRowKeysInDateRange` / `insertEngagementRowsIntoBigQuery` in `engagement_import.js`). Re-running should insert zero new rows for already-imported keys.
- The Apps Script project's linked GCP project must have BigQuery access to `freewind-software` for the `BigQuery` advanced service (enabled in `appsscript.json`) to work.
