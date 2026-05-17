// api/validate-token.js
// Called by contact forms just before they submit to Zoho.
// Verifies the one-time token issued by /api/verify is genuine,
// fresh (< 5 min), and hasn't been used before in this Lambda
// instance's lifetime (best-effort - real anti-replay needs Redis).

import crypto from 'crypto';

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'AC_TOK_9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3e2d1c0b';
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

// Lightweight in-memory replay cache (per Lambda instance).
// Bots that retry quickly hit the same warm instance and get blocked.
const seen = new Map();
const SEEN_MAX = 5000;

export default function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing token' });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return res.status(200).json({ success: false, message: 'Malformed token' });
  }
  const [challengeId, issuedAt, sig] = parts;

  // Verify signature
  const payload = `${challengeId}|${issuedAt}`;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  if (!timingSafeEq(expected, sig)) {
    return res.status(200).json({ success: false, message: 'Invalid token signature' });
  }

  // Check age
  const age = Date.now() - Number(issuedAt);
  if (age < 0 || age > TOKEN_MAX_AGE_MS) {
    return res.status(200).json({ success: false, message: 'Token expired' });
  }

  // Replay check (best-effort)
  if (seen.has(token)) {
    return res.status(200).json({ success: false, message: 'Token already used' });
  }
  if (seen.size >= SEEN_MAX) {
    // Drop oldest entries
    const oldest = [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 1000);
    for (const [k] of oldest) seen.delete(k);
  }
  seen.set(token, Date.now());

  return res.status(200).json({ success: true });
}

function setCors(req, res) {
  const allowed = [
    'https://ausclear.com.au',
    'https://www.ausclear.com.au',
    'https://support.ausclear.au',
    'https://www.support.ausclear.au',
    'https://portal.ausclear.au',
  ];
  const origin = req.headers.origin || '';
  const useOrigin = allowed.includes(origin) ? origin : allowed[1];
  res.setHeader('Access-Control-Allow-Origin', useOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
