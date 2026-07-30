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
