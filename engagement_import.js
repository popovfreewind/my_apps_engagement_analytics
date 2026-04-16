function importEngagementFromZipEmails(sheet, options) {
  const config = options || {};
  const neededHeaders = config.neededHeaders;
  const dedupeKeyColumn = config.dedupeKeyColumn;
  const subjectFilters = config.subjectFilters;
  const firstDataRow = config.firstDataRow;
  const maxThreads = config.maxThreads || 500;

  if (!Array.isArray(neededHeaders) || neededHeaders.length === 0) {
    throw new Error('importEngagementFromZipEmails: options.neededHeaders is required');
  }
  if (!dedupeKeyColumn || typeof dedupeKeyColumn !== 'string') {
    throw new Error('importEngagementFromZipEmails: options.dedupeKeyColumn is required');
  }
  if (!Array.isArray(subjectFilters)) {
    throw new Error('importEngagementFromZipEmails: options.subjectFilters must be an array');
  }
  if (typeof firstDataRow !== 'number' || firstDataRow < 1) {
    throw new Error('importEngagementFromZipEmails: options.firstDataRow must be a positive number');
  }

  ensureEngagementSheetHeaders(sheet, neededHeaders);

  const keyColIndexInSheet = getColumnIndexByHeader(neededHeaders, dedupeKeyColumn);
  if (keyColIndexInSheet === -1) {
    throw new Error('importEngagementFromZipEmails: dedupeKeyColumn not found in neededHeaders');
  }

  const dataRowCount = Math.max(0, sheet.getLastRow() - (firstDataRow - 1));
  const existingKeys = new Set(
    dataRowCount > 0
      ? sheet
        .getRange(firstDataRow, keyColIndexInSheet, dataRowCount)
        .getValues()
        .flat()
        .map(function (key) { return String(key).trim(); })
      : []
  );

  let totalAppended = 0;
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
          const rowsToAppend = [];

          sortedDates.forEach(function (dateKey) {
            const metrics = dailyMetricsMap[dateKey] || {};
            const rowKey = [dateKey, channelName, countryCode].join('|');

            if (!dateKey || existingKeys.has(rowKey)) {
              return;
            }

            const rowObject = {
              row_key: rowKey,
              date: dateKey,
              channel_name: channelName,
              country_code: countryCode,
              viewers: valueOrEmpty(metrics.viewers),
              visitors: valueOrEmpty(metrics.visitors),
              average_minutes_per_viewer: valueOrEmpty(metrics.average_minutes_per_viewer),
              channel_installs: valueOrEmpty(metrics.channel_installs),
              channel_uninstalls: valueOrEmpty(metrics.channel_uninstalls),
              net_installs: valueOrEmpty(metrics.net_installs),
              cumulative_installs: valueOrEmpty(metrics.cumulative_installs)
            };

            rowsToAppend.push(neededHeaders.map(function (header) {
              return rowObject.hasOwnProperty(header) ? rowObject[header] : '';
            }));
            existingKeys.add(rowKey);
          });

          if (rowsToAppend.length > 0) {
            const nextRow = sheet.getLastRow() + 1;
            sheet.getRange(nextRow, 1, rowsToAppend.length, neededHeaders.length).setValues(rowsToAppend);
            totalAppended += rowsToAppend.length;
            Logger.log('Appended %d rows from ZIP "%s".', rowsToAppend.length, attachment.getName());
          } else {
            Logger.log('No new rows to append from ZIP "%s".', attachment.getName());
          }
        });
      });

      thread.markRead();
      thread.moveToTrash();
    });
  });

  Logger.log('=== importEngagementFromZipEmails COMPLETE: %d total rows appended ===', totalAppended);
}

function ensureEngagementSheetHeaders(sheet, headers) {
  if (!sheet) {
    throw new Error('ensureEngagementSheetHeaders: sheet is required');
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const existingHeaderValues = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasMismatch = headers.some(function (header, index) {
    return String(existingHeaderValues[index] || '').trim() !== header;
  });

  if (hasMismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
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
    const dateKey = normalizeDate(row[dateIdx]);
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
    const dateKey = normalizeDate(row[dateIdx]);
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
    const dateKey = normalizeDate(row[dateIdx]);
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
    const dateKey = normalizeDate(row[dateIdx]);
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

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
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

function valueOrEmpty(value) {
  return value === undefined || value === null ? '' : value;
}
