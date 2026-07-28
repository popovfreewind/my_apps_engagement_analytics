function importEngagementFromZipEmails(options) {
  const config = options || {};
  const subjectFilters = config.subjectFilters;
  const maxThreads = config.maxThreads || 500;

  if (!Array.isArray(subjectFilters)) {
    throw new Error('importEngagementFromZipEmails: options.subjectFilters must be an array');
  }

  const rowsToInsert = [];
  const seenRowKeysThisRun = new Set();

  Logger.log('=== importEngagementFromZipEmails START @ %s ===', new Date());

  subjectFilters.forEach(function (subject) {
    const threads = GmailApp.search('subject:"' + subject + '" has:attachment', 0, maxThreads);
    Logger.log('Searching Gmail for subject "%s" (maxThreads: %d). Found %d threads.', subject, maxThreads, threads.length);

    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        const channelName = normalizeChannelNameForEngagement(
          extractChannelNameFromSubject(message.getSubject())
        );

        message.getAttachments().forEach(function (attachment) {
          if (!attachment.getName().toLowerCase().endsWith('.zip')) {
            return;
          }

          const csvBlobs = collectCsvBlobsFromZip(attachment);
          const csvBlobKeys = Object.keys(csvBlobs);

          if (csvBlobKeys.length === 0) {
            Logger.log('ZIP "%s" contains no CSV files.', attachment.getName());
            return;
          }

          const countryCode = extractCountryCode(csvBlobs);
          const dailyMetricsMap = buildDailyMetricsMap(csvBlobs);
          const sortedDates = Object.keys(dailyMetricsMap).sort();
          let rowsFromZip = 0;

          sortedDates.forEach(function (dateKey) {
            const metrics = dailyMetricsMap[dateKey] || {};
            const dateStr = formatDateToYMD(dateKey);
            if (!dateStr) {
              return;
            }

            const rowKey = buildRowKey(dateStr, channelName, countryCode);
            if (seenRowKeysThisRun.has(rowKey)) {
              return;
            }

            const rowObject = {
              row_key: rowKey,
              date: dateStr,
              channel_name: channelName,
              country_code: countryCode,
              viewers: safeParseInt(metrics.viewers),
              visitors: safeParseInt(metrics.visitors),
              average_minutes_per_viewer: safeParseFloat(metrics.average_minutes_per_viewer),
              channel_installs: safeParseInt(metrics.channel_installs),
              channel_uninstalls: safeParseInt(metrics.channel_uninstalls),
              net_installs: safeParseInt(metrics.net_installs),
              cumulative_installs: safeParseInt(metrics.cumulative_installs)
            };

            rowsToInsert.push(rowObject);
            seenRowKeysThisRun.add(rowKey);
            rowsFromZip++;
          });

          Logger.log('Parsed %d row(s) from ZIP "%s".', rowsFromZip, attachment.getName());
        });
      });

      thread.markRead();
      thread.moveToTrash();
    });
  });

  if (rowsToInsert.length === 0) {
    Logger.log('No new records found. Skipping BigQuery insert.');
    return;
  }

  const batchDates = rowsToInsert.map(function (row) { return row.date; });
  const minDate = batchDates.reduce(function (a, b) { return a < b ? a : b; });
  const maxDate = batchDates.reduce(function (a, b) { return a > b ? a : b; });

  const existingRowKeys = fetchExistingRowKeysInDateRange(minDate, maxDate);
  const newRows = rowsToInsert.filter(function (row) { return !existingRowKeys.has(row.row_key); });

  Logger.log(
    'Batch dates: %s to %s. Incoming rows: %d, Already in DB: %d, New rows to insert: %d',
    minDate, maxDate, rowsToInsert.length, rowsToInsert.length - newRows.length, newRows.length
  );

  if (newRows.length === 0) {
    Logger.log('No new records found. Skipping BigQuery insert.');
    return;
  }

  const insertedCount = insertEngagementRowsIntoBigQuery(newRows);

  Logger.log('=== importEngagementFromZipEmails COMPLETE: %d total rows inserted ===', insertedCount);
}

/**
 * Queries BigQuery for `row_key`s that already exist within [minDate, maxDate]
 * (inclusive, both 'YYYY-MM-DD' strings) in engagement_daily, so the caller
 * can insert only genuinely new rows ("insert only if not exists"). Handles
 * asynchronous job completion and result pagination.
 */
function fetchExistingRowKeysInDateRange(minDate, maxDate) {
  const request = {
    query: 'SELECT row_key FROM `' + BIGQUERY_CONFIG.PROJECT_ID + '.' + BIGQUERY_CONFIG.DATASET_ID + '.' + BIGQUERY_CONFIG.TABLE_ENGAGEMENT + '` WHERE date BETWEEN @minDate AND @maxDate',
    useLegacySql: false,
    parameterMode: 'NAMED',
    queryParameters: [
      { name: 'minDate', parameterType: { type: 'DATE' }, parameterValue: { value: minDate } },
      { name: 'maxDate', parameterType: { type: 'DATE' }, parameterValue: { value: maxDate } }
    ],
    location: BIGQUERY_CONFIG.LOCATION
  };

  let queryResults = BigQuery.Jobs.query(request, BIGQUERY_CONFIG.PROJECT_ID);
  const jobId = queryResults.jobReference.jobId;

  let sleepTimeMs = 500;
  while (!queryResults.jobComplete) {
    Utilities.sleep(sleepTimeMs);
    sleepTimeMs = Math.min(sleepTimeMs * 2, 4000);
    queryResults = BigQuery.Jobs.getQueryResults(BIGQUERY_CONFIG.PROJECT_ID, jobId, { location: BIGQUERY_CONFIG.LOCATION });
  }

  const existingKeys = new Set();
  (queryResults.rows || []).forEach(function (row) { existingKeys.add(row.f[0].v); });

  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(BIGQUERY_CONFIG.PROJECT_ID, jobId, {
      pageToken: queryResults.pageToken,
      location: BIGQUERY_CONFIG.LOCATION
    });
    (queryResults.rows || []).forEach(function (row) { existingKeys.add(row.f[0].v); });
  }

  return existingKeys;
}

/**
 * Streams rows into BigQuery.engagement_daily via BigQuery.Tabledata.insertAll,
 * batching in chunks of at most 500 rows per request. Uses each row's
 * `row_key` as the BigQuery `insertId` to get best-effort de-duplication on
 * the streaming buffer. Returns the number of rows successfully sent
 * (BigQuery-reported per-row insertErrors are logged, not thrown).
 */
function insertEngagementRowsIntoBigQuery(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    Logger.log('insertEngagementRowsIntoBigQuery: no rows to insert.');
    return 0;
  }

  const CHUNK_SIZE = 500;
  let insertedCount = 0;

  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CHUNK_SIZE);

    const requestBody = {
      rows: chunk.map(function (row) {
        return { insertId: row.row_key, json: row };
      }),
      skipInvalidRows: false,
      ignoreUnknownValues: false
    };

    const response = BigQuery.Tabledata.insertAll(
      requestBody,
      BIGQUERY_CONFIG.PROJECT_ID,
      BIGQUERY_CONFIG.DATASET_ID,
      BIGQUERY_CONFIG.TABLE_ENGAGEMENT
    );

    if (response && response.insertErrors && response.insertErrors.length > 0) {
      response.insertErrors.forEach(function (insertError) {
        const failedRow = chunk[insertError.index];
        Logger.log(
          'BigQuery insert error for row_key "%s" (chunk offset %d, index %d): %s',
          failedRow ? failedRow.row_key : 'unknown',
          offset,
          insertError.index,
          JSON.stringify(insertError.errors)
        );
      });
      insertedCount += chunk.length - response.insertErrors.length;
    } else {
      insertedCount += chunk.length;
    }

    Logger.log('Streamed chunk of %d row(s) to BigQuery (rows %d-%d).', chunk.length, offset, offset + chunk.length - 1);
  }

  return insertedCount;
}

function collectCsvBlobsFromZip(zipAttachment) {
  const csvBlobs = {};
  Utilities.unzip(zipAttachment).forEach(function (blob) {
    const blobName = blob.getName();
    if (!blobName || !blobName.toLowerCase().endsWith('.csv')) {
      return;
    }

    csvBlobs[blobName.toLowerCase()] = blob;
  });
  return csvBlobs;
}

function buildDailyMetricsMap(csvBlobs) {
  const byDate = {};

  ingestVisitorsAndViewers(csvBlobs, byDate);
  ingestAverageMinutes(csvBlobs, byDate);
  ingestInstallGrowth(csvBlobs, byDate);
  ingestCumulativeInstalls(csvBlobs, byDate);

  return byDate;
}

function ingestVisitorsAndViewers(csvBlobs, byDate) {
  const blob = findCsvBlobByName(csvBlobs, ['channel_visitors_and_streaming_viewers.csv']);
  if (!blob) {
    return;
  }

  const parsed = parseCsvBlob(blob);
  const dateIdx = getHeaderIndex(parsed.headers, 'Agg Channel Metrics Time Grain Date Key Date');
  const visitorsIdx = getHeaderIndex(parsed.headers, 'Visitors');
  const viewersIdx = getHeaderIndex(parsed.headers, 'Viewers');

  if (dateIdx === -1) {
    return;
  }

  parsed.rows.forEach(function (row) {
    const dateKey = formatDateToYMD(row[dateIdx]);
    if (!dateKey) {
      return;
    }

    byDate[dateKey] = byDate[dateKey] || {};

    if (visitorsIdx !== -1) {
      byDate[dateKey].visitors = normalizeNumber(row[visitorsIdx]);
    }
    if (viewersIdx !== -1) {
      byDate[dateKey].viewers = normalizeNumber(row[viewersIdx]);
    }
  });
}

function ingestAverageMinutes(csvBlobs, byDate) {
  const blob = findCsvBlobByName(csvBlobs, ['minutes_streamed.csv']);
  if (!blob) {
    return;
  }

  const parsed = parseCsvBlob(blob);
  const dateIdx = getHeaderIndex(parsed.headers, 'Agg Channel Metrics Time Grain Date Key Date');
  const avgMinutesIdx = getHeaderIndex(parsed.headers, 'Average Minutes per Streaming Account');

  if (dateIdx === -1 || avgMinutesIdx === -1) {
    return;
  }

  parsed.rows.forEach(function (row) {
    const dateKey = formatDateToYMD(row[dateIdx]);
    if (!dateKey) {
      return;
    }

    byDate[dateKey] = byDate[dateKey] || {};
    byDate[dateKey].average_minutes_per_viewer = normalizeNumber(row[avgMinutesIdx]);
  });
}

function ingestInstallGrowth(csvBlobs, byDate) {
  const blob = findCsvBlobByName(csvBlobs, ['install_base_growth.csv']);
  if (!blob) {
    return;
  }

  const parsed = parseCsvBlob(blob);
  const dateIdx = getHeaderIndex(parsed.headers, 'Agg Channel Metrics Time Grain Date Key Date');
  const installsIdx = getHeaderIndex(parsed.headers, 'Channel Installs');
  const uninstallsIdx = getHeaderIndex(parsed.headers, 'Channel Uninstalls');
  const netInstallsIdx = getHeaderIndex(parsed.headers, 'Net Installs');

  if (dateIdx === -1) {
    return;
  }

  parsed.rows.forEach(function (row) {
    const dateKey = formatDateToYMD(row[dateIdx]);
    if (!dateKey) {
      return;
    }

    byDate[dateKey] = byDate[dateKey] || {};

    if (installsIdx !== -1) {
      byDate[dateKey].channel_installs = normalizeNumber(row[installsIdx]);
    }
    if (uninstallsIdx !== -1) {
      byDate[dateKey].channel_uninstalls = normalizeNumber(row[uninstallsIdx]);
    }
    if (netInstallsIdx !== -1) {
      byDate[dateKey].net_installs = normalizeNumber(row[netInstallsIdx]);
    }
  });
}

function ingestCumulativeInstalls(csvBlobs, byDate) {
  const blob = findCsvBlobByName(csvBlobs, ['cumulative_net_installs.csv']);
  if (!blob) {
    return;
  }

  const parsed = parseCsvBlob(blob);
  const dateIdx = getHeaderIndex(parsed.headers, 'Agg Channel Metrics Time Grain Date Key Date');
  const cumulativeIdx = getHeaderIndex(parsed.headers, 'Agg Channel Metrics Time Grain Account Installs Todate Sum');

  if (dateIdx === -1 || cumulativeIdx === -1) {
    return;
  }

  parsed.rows.forEach(function (row) {
    const dateKey = formatDateToYMD(row[dateIdx]);
    if (!dateKey) {
      return;
    }

    byDate[dateKey] = byDate[dateKey] || {};
    byDate[dateKey].cumulative_installs = normalizeNumber(row[cumulativeIdx]);
  });
}

function extractCountryCode(csvBlobs) {
  const avgDailyBlob = findCsvBlobByName(csvBlobs, ['average_daily_visitors.csv']);
  if (avgDailyBlob) {
    const parsed = parseCsvBlob(avgDailyBlob);
    const countryIdx = findCountryCodeHeaderIndex(parsed.headers);

    if (countryIdx !== -1) {
      for (var i = 0; i < parsed.rows.length; i++) {
        const country = normalizeCountryCode(parsed.rows[i][countryIdx]);
        if (country) {
          return country;
        }
      }
    }
  }

  const blobNames = Object.keys(csvBlobs);
  for (var j = 0; j < blobNames.length; j++) {
    const parsedCsv = parseCsvBlob(csvBlobs[blobNames[j]]);
    const idx = findCountryCodeHeaderIndex(parsedCsv.headers);

    if (idx === -1) {
      continue;
    }

    for (var k = 0; k < parsedCsv.rows.length; k++) {
      const code = normalizeCountryCode(parsedCsv.rows[k][idx]);
      if (code) {
        return code;
      }
    }
  }

  return '';
}

function extractChannelNameFromSubject(subject) {
  const raw = String(subject || '').trim();
  if (!raw) {
    return '';
  }

  let cleaned = raw;
  cleaned = cleaned.replace(/\s*-\s*results.*$/i, '');
  cleaned = cleaned.replace(/\s+engagement\b.*$/i, '');
  cleaned = cleaned.replace(/\s+copy\b/ig, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned || raw;
}

function normalizeChannelNameForEngagement(name) {
  const input = String(name || '').trim();
  if (!input) {
    return '';
  }

  if (!ENGAGEMENT_CHANNEL_NAME_ALIASES) {
    return input;
  }

  const canonicalNames = Object.keys(ENGAGEMENT_CHANNEL_NAME_ALIASES);
  for (var i = 0; i < canonicalNames.length; i++) {
    const canonicalName = canonicalNames[i];
    const aliases = ENGAGEMENT_CHANNEL_NAME_ALIASES[canonicalName] || [];

    if (input.toLowerCase() === canonicalName.toLowerCase()) {
      return canonicalName;
    }

    for (var j = 0; j < aliases.length; j++) {
      if (input.toLowerCase() === String(aliases[j] || '').toLowerCase()) {
        return canonicalName;
      }
    }
  }

  return input;
}

function parseCsvBlob(blob) {
  const csvData = Utilities.parseCsv(blob.getDataAsString());
  if (!csvData || csvData.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = csvData[0].map(function (header) { return String(header || '').trim(); });
  const rows = csvData.slice(1);
  return { headers: headers, rows: rows };
}

function findCsvBlobByName(csvBlobs, expectedNames) {
  const names = Object.keys(csvBlobs);
  for (var i = 0; i < names.length; i++) {
    for (var j = 0; j < expectedNames.length; j++) {
      if (names[i].indexOf(expectedNames[j].toLowerCase()) !== -1) {
        return csvBlobs[names[i]];
      }
    }
  }
  return null;
}

function getHeaderIndex(headers, expectedHeader) {
  return headers.indexOf(expectedHeader);
}

function findCountryCodeHeaderIndex(headers) {
  for (var i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').toLowerCase();
    if (header.indexOf('channel store code') !== -1 || header.indexOf('country code') !== -1) {
      return i;
    }
  }
  return -1;
}

function normalizeCountryCode(value) {
  const text = String(value || '').trim().toLowerCase();
  return text;
}

function normalizeNumber(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const sanitized = text.replace(/,/g, '');
  const parsed = Number(sanitized);
  return Number.isNaN(parsed) ? text : parsed;
}
