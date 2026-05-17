// api/verify.js
// Verifies a slider puzzle CAPTCHA attempt and issues a one-time token.
//
// Request body:
//   { challengeId, gapX, gapY, issuedAt, signature, droppedX, trajectory }
//
// trajectory is an array of [t, x] samples from the drag motion. Used to
// reject teleport-style bot drags.
//
// On success: { success: true, token } where token is HMAC(challengeId|ts)
// and is valid for 5 minutes. The contact form posts this token along with
// its data. The form's submit handler can pass it to /api/validate-token
// before posting to Zoho.

import crypto from 'crypto';

const SECRET = process.env.CAPTCHA_SECRET || 'AC_KAPT_4f8a2e9c1b7d6a5e8f9c2d3e1a4b7c8d9e0f1a2b';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'AC_TOK_9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3e2d1c0b';

const TOLERANCE_PX = 6;          // max pixels off from true gap X
const MAX_AGE_MS = 5 * 60 * 1000; // challenge expires after 5 min
const MIN_DRAG_TIME_MS = 350;     // shorter = bot
const MIN_TRAJECTORY_POINTS = 4;  // bots often submit 2 points (start+end)

export default function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { challengeId, gapX, gapY, issuedAt, signature, droppedX, trajectory } = req.body || {};

  if (!challengeId || gapX == null || gapY == null || !issuedAt || !signature || droppedX == null) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  // 1. Verify signature - did we issue this challenge?
  const payload = `${challengeId}|${gapX}|${gapY}|${issuedAt}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (!timingSafeEq(expected, String(signature))) {
    return res.status(200).json({ success: false, message: 'Invalid signature' });
  }

  // 2. Check age
  const age = Date.now() - Number(issuedAt);
  if (age < 0 || age > MAX_AGE_MS) {
    return res.status(200).json({ success: false, message: 'Challenge expired', code: 'expired' });
  }

  // 3. Check drop precision
  const diff = Math.abs(Number(droppedX) - Number(gapX));
  if (diff > TOLERANCE_PX) {
    return res.status(200).json({ success: false, message: 'Try again', code: 'wrong_position' });
  }

  // 4. Validate trajectory looks human
  if (!Array.isArray(trajectory) || trajectory.length < MIN_TRAJECTORY_POINTS) {
    return res.status(200).json({ success: false, message: 'Suspicious motion', code: 'bot_trajectory' });
  }

  const dragMs = trajectory[trajectory.length - 1][0] - trajectory[0][0];
  if (dragMs < MIN_DRAG_TIME_MS) {
    return res.status(200).json({ success: false, message: 'Too fast', code: 'too_fast' });
  }

  // Check for monotonic-only motion (humans wiggle, bots don't)
  const xs = trajectory.map(p => p[1]);
  let reversals = 0;
  let lastDir = 0;
  for (let i = 1; i < xs.length; i++) {
    const dir = Math.sign(xs[i] - xs[i - 1]);
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir) reversals++;
    if (dir !== 0) lastDir = dir;
  }
  // A bot's straight-line drag has 0 reversals. Real human dragging always has
  // at least 1-2 small backtracks or jitter. Require minimum 1.
  if (reversals < 1 && trajectory.length >= 8) {
    return res.status(200).json({ success: false, message: 'Motion looks automated', code: 'bot_trajectory' });
  }

  // 5. Issue a one-time token
  const tokenIssuedAt = Date.now();
  const tokenPayload = `${challengeId}|${tokenIssuedAt}`;
  const tokenSig = crypto.createHmac('sha256', TOKEN_SECRET).update(tokenPayload).digest('hex');
  const token = `${challengeId}.${tokenIssuedAt}.${tokenSig}`;

  return res.status(200).json({ success: true, token });
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
