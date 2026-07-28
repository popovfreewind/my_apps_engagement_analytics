function getSheetByName(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
}

function getOrCreateSheetByName(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  return sheet;
}

function getCellValueFromSheet(sheet, row, col) {
  try {

    // Check if the sheet exists
    if (!sheet) {
      Logger.log(`Error: The sheet was not found.`);
      return "";
    }

    // Check for valid row and column numbers
    if (row < 1 || col < 1) {
      Logger.log(`Error: Row and column numbers must be 1 or greater. Provided row: ${row}, col: ${col}.`);
      return "";
    }

    return sheet.getRange(row, col).getValue();

  } catch (e) {
    Logger.log(`An error occurred while trying to get a value at row ${row}, col ${col}: ${e.message}`);
    return "";
  }
}

function setCellValueToSheet(sheet, row, col, value) {
  try {
    // Check if the sheet exists
    if (!sheet) {
      Logger.log(`Error: The sheet was not found.`);
      return;
    }

    // Check for valid row and column numbers
    if (row < 1 || col < 1) {
      Logger.log(`Error: Row and column numbers must be 1 or greater. Provided row: ${row}, col: ${col}.`);
      return;
    }

    sheet.getRange(row, col).setValue(value);

  } catch (e) {
    Logger.log(`An error occurred while trying to set a value at row ${row}, col ${col}: ${e.message}`);
  }
}

function getColumnIndexByHeader(headers, columnName) {
  if (!Array.isArray(headers)) {
    throw new Error('getColumnIndexByHeader: headers must be an array');
  }

  const zeroBasedIndex = headers.indexOf(columnName);
  if (zeroBasedIndex === -1) {
    return -1;
  }

  return zeroBasedIndex + 1;
}

/**
 * Robustly formats any incoming date representation (Date object, ISO string,
 * timestamped string, or other parseable string) into a strict 'YYYY-MM-DD'
 * string. Returns '' when the value cannot be parsed as a date. Used to build
 * BigQuery-safe `date` values and `row_key` values (never pass a Date object
 * or a localized string date into BigQuery).
 */
function formatDateToYMD(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    // Handles both "YYYY-MM-DD" and "YYYY-MM-DD HH:mm:ss"
    const isoMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      return isoMatch[1];
    }

    const parsedFromString = new Date(trimmed);
    if (!isNaN(parsedFromString.getTime())) {
      return Utilities.formatDate(parsedFromString, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }

    return '';
  }

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return '';
}

function normalizeToIsoDate(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  const formatted = formatDateToYMD(value);
  return formatted || value;
}

/**
 * Builds the BigQuery `engagement_daily.row_key` value. Strictly formatted as
 * `${YYYY-MM-DD}|${channel_name}|${country_code}` — dateStr is always passed
 * through formatDateToYMD so callers can never leak a Date object or a
 * localized date string into the key.
 */
function buildRowKey(dateStr, channelName, countryCode) {
  return [formatDateToYMD(dateStr), channelName, countryCode].join('|');
}

/**
 * Safely parses an integer, returning `fallback` (default null) for
 * empty/NaN input instead of '' or NaN — keeps BigQuery INTEGER columns clean.
 */
function safeParseInt(value, fallback) {
  const emptyResult = fallback === undefined ? null : fallback;

  if (value === null || value === undefined || value === '') {
    return emptyResult;
  }

  const sanitized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  if (sanitized === '') {
    return emptyResult;
  }

  const parsed = parseInt(sanitized, 10);
  return Number.isNaN(parsed) ? emptyResult : parsed;
}

/**
 * Safely parses a float, returning `fallback` (default null) for
 * empty/NaN input instead of '' or NaN — keeps BigQuery FLOAT columns clean.
 */
function safeParseFloat(value, fallback) {
  const emptyResult = fallback === undefined ? null : fallback;

  if (value === null || value === undefined || value === '') {
    return emptyResult;
  }

  const sanitized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  if (sanitized === '') {
    return emptyResult;
  }

  const parsed = parseFloat(sanitized);
  return Number.isNaN(parsed) ? emptyResult : parsed;
}

function normalizeSheetDateColumnByName(sheet, options) {
  const config = options || {};
  const columnName = config.columnName;
  if (!columnName || typeof columnName !== 'string') {
    throw new Error('normalizeSheetDateColumnByName: options.columnName is required');
  }

  const logLabel = config.logLabel || columnName;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('No %s changes needed', logLabel);
    return 0;
  }

  const dateColIndex = data[0].indexOf(columnName);
  if (dateColIndex === -1) {
    Logger.log('Warning: %s column not found', columnName);
    return 0;
  }

  const normalizedValues = [];
  let updatedRows = 0;

  for (let i = 1; i < data.length; i++) {
    const current = data[i][dateColIndex];
    const normalized = normalizeToIsoDate(current);
    if (normalized !== current) {
      updatedRows++;
    }
    normalizedValues.push([normalized]);
  }

  if (updatedRows > 0) {
    sheet.getRange(2, dateColIndex + 1, normalizedValues.length, 1).setValues(normalizedValues);
    Logger.log('Updated %d %s row(s) in sheet', updatedRows, logLabel);
  } else {
    Logger.log('No %s changes needed', logLabel);
  }

  return updatedRows;
}