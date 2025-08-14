'use strict';

// Simple sliding window rate limiter in-memory (reset on restart).
// Defaults: 5 searches per 10 minutes per user.

const DEFAULT_LIMIT = Number(process.env.SEARCH_RATE_LIMIT || 5);
const WINDOW_MS = Number(process.env.SEARCH_RATE_WINDOW_MS || 10 * 60 * 1000);

// Map<userId, number[] timestamps>
const userToTimestamps = new Map();

function isAllowed(userId) {
  const now = Date.now();
  const arr = userToTimestamps.get(userId) || [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= DEFAULT_LIMIT) return false;
  recent.push(now);
  userToTimestamps.set(userId, recent);
  return true;
}

module.exports = { isAllowed };


