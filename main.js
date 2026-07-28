function proceedEngagementImport() {
    importEngagementFromZipEmails({
        subjectFilters: ENGAGEMENT_SUBJECT_FILTERS
    });
}

function runAllAnalytics() {
    Logger.log('=== runAllAnalytics START @ %s ===', new Date());
    proceedEngagementImport();
    Logger.log('=== runAllAnalytics COMPLETE @ %s ===', new Date());
}

// --- Batch entry points (for scheduled trigger, processes 1 thread per run) ---

function proceedEngagementImportBatch() {
    importEngagementFromZipEmails({
        subjectFilters: ENGAGEMENT_SUBJECT_FILTERS,
        maxThreads: 1
    });
}

function runAllAnalyticsBatch() {
    Logger.log('=== runAllAnalyticsBatch START @ %s ===', new Date());
    proceedEngagementImportBatch();
    Logger.log('=== runAllAnalyticsBatch COMPLETE @ %s ===', new Date());
}

// --- Maintenance entry points (DEPRECATED) ---
// Engagement data now streams directly into BigQuery (see BIGQUERY_CONFIG /
// engagement_import.js) and is no longer written to Google Sheets. These
// entry points are kept only for one-off cleanup of the legacy
// ENGAGEMENT_SHEET spreadsheet, if it still exists. Dedup for BigQuery is
// handled via row_key + streaming insertId / SQL, not these functions.

function removeEngagementDuplicates() {
    const sheet = getSheetByName(ENGAGEMENT_SHEET);
    removeDuplicatesInSheet(sheet, ENGAGEMENT_DEDUP_KEY);
}

function normalizeEngagementChannelNames() {
    const sheet = getSheetByName(ENGAGEMENT_SHEET);
    normalizeEngagementChannelNamesInSheet(sheet);
}

