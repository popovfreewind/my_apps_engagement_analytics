function proceedEngagementImport() {
    const sheet = getOrCreateSheetByName(ENGAGEMENT_SHEET);
    importEngagementFromZipEmails(sheet, {
        neededHeaders: ENGAGEMENT_HEADERS,
        dedupeKeyColumn: ENGAGEMENT_DEDUP_KEY,
        subjectFilters: ENGAGEMENT_SUBJECT_FILTERS,
        firstDataRow: FIRST_DATA_ROW
    });
}

function runAllAnalytics() {
    Logger.log('=== runAllAnalytics START @ %s ===', new Date());
    proceedEngagementImport();
    Logger.log('=== runAllAnalytics COMPLETE @ %s ===', new Date());
}

// --- Batch entry points (for scheduled trigger, processes 1 thread per run) ---

function proceedEngagementImportBatch() {
    const sheet = getOrCreateSheetByName(ENGAGEMENT_SHEET);
    importEngagementFromZipEmails(sheet, {
        neededHeaders: ENGAGEMENT_HEADERS,
        dedupeKeyColumn: ENGAGEMENT_DEDUP_KEY,
        subjectFilters: ENGAGEMENT_SUBJECT_FILTERS,
        firstDataRow: FIRST_DATA_ROW,
        maxThreads: 1
    });
}

function runAllAnalyticsBatch() {
    Logger.log('=== runAllAnalyticsBatch START @ %s ===', new Date());
    proceedEngagementImportBatch();
    Logger.log('=== runAllAnalyticsBatch COMPLETE @ %s ===', new Date());
}

// --- Maintenance entry points ---

function removeEngagementDuplicates() {
    const sheet = getSheetByName(ENGAGEMENT_SHEET);
    removeDuplicatesInSheet(sheet, ENGAGEMENT_DEDUP_KEY);
}

function normalizeEngagementChannelNames() {
    const sheet = getSheetByName(ENGAGEMENT_SHEET);
    normalizeEngagementChannelNamesInSheet(sheet);
}

