
function removeDuplicatesInSheet(sheet, key) {
  if (!key || typeof key !== 'string') {
    throw new Error('removeDuplicatesInSheet: keyColumnName is required');
  }

  // 1) Grab all the data
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;      // nothing to do if only header or empty

  // 2) Figure out which column is our key
  const headers = data[0];
  const keyIndex = headers.indexOf(key);
  if (keyIndex < 0) throw new Error(`Key column "${key}" not found in headers.`);

  // 3) Build a new list of rows, keeping first occurrence only
  const seen = new Set();
  const newData = [headers];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const keyValue = row[keyIndex];
    if (!seen.has(keyValue)) {
      seen.add(keyValue);
      newData.push(row);
    }
  }

  // 4) Wipe the sheet and write back only the deduped rows
  sheet.clearContents();
  sheet
    .getRange(1, 1, newData.length, newData[0].length)
    .setValues(newData);

  Logger.log(`removeDuplicates("${key}") → kept ${newData.length - 1} of ${data.length - 1} rows.`);
}