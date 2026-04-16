function normalizeEngagementChannelNamesInSheet(sheet) {
  if (!sheet) {
    throw new Error('normalizeEngagementChannelNames: engagement sheet not found');
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('normalizeEngagementChannelNames: no data rows to normalize');
    return;
  }

  const headers = data[0];
  const rowKeyIndex = headers.indexOf(ENGAGEMENT_DEDUP_KEY);
  const dateIndex = headers.indexOf('date');
  const channelNameIndex = headers.indexOf('channel_name');
  const countryCodeIndex = headers.indexOf('country_code');

  if (rowKeyIndex === -1 || dateIndex === -1 || channelNameIndex === -1 || countryCodeIndex === -1) {
    throw new Error('normalizeEngagementChannelNames: required columns are missing');
  }

  let updatedRows = 0;
  const duplicateKeys = new Set();
  const seenKeys = new Set();

  for (var i = 1; i < data.length; i++) {
    const row = data[i];
    const originalChannelName = String(row[channelNameIndex] || '').trim();
    const normalizedChannelName = normalizeChannelNameForEngagement(originalChannelName);

    if (normalizedChannelName !== originalChannelName) {
      row[channelNameIndex] = normalizedChannelName;
      updatedRows++;
    }

    const dateValue = String(row[dateIndex] || '').trim();
    const countryCode = String(row[countryCodeIndex] || '').trim();
    const normalizedRowKey = [dateValue, normalizedChannelName, countryCode].join('|');

    if (String(row[rowKeyIndex] || '') !== normalizedRowKey) {
      row[rowKeyIndex] = normalizedRowKey;
    }

    if (seenKeys.has(normalizedRowKey)) {
      duplicateKeys.add(normalizedRowKey);
    }
    seenKeys.add(normalizedRowKey);
  }

  sheet.getRange(2, 1, data.length - 1, headers.length).setValues(data.slice(1));
  Logger.log('normalizeEngagementChannelNames: updated %d row(s)', updatedRows);

  if (duplicateKeys.size > 0) {
    Logger.log(
      'normalizeEngagementChannelNames: detected %d duplicate row_key values after normalization; run removeEngagementDuplicates()',
      duplicateKeys.size
    );
  }
}