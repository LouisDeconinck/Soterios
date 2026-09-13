'use strict';

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const REFERENCE_FILE = 'en.json';

// Recursively collects leaf key paths ("settings.theme.title") so flat and
// nested locale files can be compared on equal footing. Keys that appear both
// as a flat dotted key and inside a nested object are reported as duplicates.
function collectKeys(value, prefix, keys, duplicates) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length) {
      if (prefix) keys.add(prefix);
      return;
    }
    for (const [key, child] of entries) {
      collectKeys(child, prefix ? `${prefix}.${key}` : key, keys, duplicates);
    }
    return;
  }
  if (keys.has(prefix)) duplicates.add(prefix);
  keys.add(prefix);
}

// Reads and parses a locale file without modifying it.
// Returns { keys, duplicates } or { error }.
function loadLocale(file) {
  const filePath = path.join(LOCALES_DIR, file);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { error: `cannot read file (${err.message})` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (err) {
    return { error: `invalid JSON (${err.message})` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'expected a JSON object of translation keys' };
  }

  const keys = new Set();
  const duplicates = new Set();
  collectKeys(parsed, '', keys, duplicates);
  return { keys, duplicates };
}

function main() {
  if (!fs.existsSync(LOCALES_DIR)) {
    console.error(`Locales directory not found: ${LOCALES_DIR}`);
    process.exitCode = 1;
    return;
  }

  const files = fs.readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  if (!files.includes(REFERENCE_FILE)) {
    console.error(`Reference locale ${REFERENCE_FILE} not found in ${LOCALES_DIR}`);
    process.exitCode = 1;
    return;
  }

  const reference = loadLocale(REFERENCE_FILE);
  if (reference.error) {
    console.error(`${REFERENCE_FILE}: ${reference.error}`);
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  let checked = 0;

  for (const file of files) {
    if (file === REFERENCE_FILE) continue;
    checked++;

    const locale = loadLocale(file);
    if (locale.error) {
      failures++;
      console.error(`${file}: ${locale.error}`);
      continue;
    }

    const missing = [...reference.keys].filter((key) => !locale.keys.has(key)).sort();
    const extra = [...locale.keys].filter((key) => !reference.keys.has(key)).sort();
    const duplicates = [...locale.duplicates].sort();

    if (missing.length || extra.length || duplicates.length) {
      failures++;
      console.error(`${file}:`);
      for (const key of missing) console.error(`  - missing key: ${key}`);
      for (const key of extra) console.error(`  - extra key: ${key}`);
      for (const key of duplicates) console.error(`  - duplicate key: ${key}`);
    }
  }

  if (failures) {
    console.error(`i18n validation failed: ${failures} of ${checked} locale(s) differ from ${REFERENCE_FILE}.`);
    process.exitCode = 1;
  } else {
    console.log(`i18n validation passed: ${checked} locale(s) match ${REFERENCE_FILE} (${reference.keys.size} keys each).`);
  }
}

main();
