'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONV_PATH = path.join(DATA_DIR, 'conversations.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConversations() {
  try {
    ensureDataDir();
    if (!fs.existsSync(CONV_PATH)) return {};
    const raw = fs.readFileSync(CONV_PATH, 'utf8');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to load conversations:', err.message);
    return {};
  }
}

function saveConversations(obj) {
  try {
    ensureDataDir();
    const json = JSON.stringify(obj, null, 2);
    fs.writeFileSync(CONV_PATH, json, 'utf8');
  } catch (err) {
    console.error('Failed to save conversations:', err.message);
  }
}

function mapToObject(map) {
  const obj = {};
  for (const [k, v] of map.entries()) obj[k] = v;
  return obj;
}

function objectToMap(obj) {
  const map = new Map();
  for (const k of Object.keys(obj || {})) map.set(k, obj[k]);
  return map;
}

module.exports = {
  loadConversations,
  saveConversations,
  mapToObject,
  objectToMap,
};


