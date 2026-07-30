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

