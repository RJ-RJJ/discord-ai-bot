'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_PATH = path.join(DATA_DIR, 'search_cache.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFileSafe() {
  try {
    ensureDataDir();
    if (!fs.existsSync(CACHE_PATH)) return {};
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeFileSafe(obj) {
  try {
    ensureDataDir();
    const json = JSON.stringify(obj, null, 2);
    fs.writeFileSync(CACHE_PATH, json, 'utf8');
  } catch (_) {
    // ignore
  }
}

function normalizeQuery(query) {
  return String(query || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const DEFAULT_TTL_SECONDS = Number(process.env.SEARCH_CACHE_TTL_SECONDS || 86400);
let memoryCache = readFileSafe();

function getCachedSearch(query) {
  const key = normalizeQuery(query);
  const entry = memoryCache[key];
  if (!entry) return null;
  const ttlSec = DEFAULT_TTL_SECONDS;
  const ageMs = Date.now() - (entry.timestamp || 0);
  if (ttlSec > 0 && ageMs > ttlSec * 1000) {
    // expired
    delete memoryCache[key];
    writeFileSafe(memoryCache);
    return null;
  }
  return entry.data;
}

function setCachedSearch(query, data) {
  const key = normalizeQuery(query);
  memoryCache[key] = { timestamp: Date.now(), data };
  writeFileSafe(memoryCache);
}

module.exports = {
  getCachedSearch,
  setCachedSearch,
  normalizeQuery,
};


