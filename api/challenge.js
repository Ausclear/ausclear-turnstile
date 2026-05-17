// api/challenge.js
// Issues a new slider puzzle CAPTCHA challenge.
// Returns: { challengeId, background, gapX, gapY, signature, issuedAt }
//
// The signature is an HMAC of (challengeId|gapX|gapY|issuedAt) — when
// the client posts back the slider position, we verify the signature
// (so client can't tamper with gapX) then check the drop is within
// tolerance of gapX.

import crypto from 'crypto';

const SECRET = process.env.CAPTCHA_SECRET || 'AC_KAPT_4f8a2e9c1b7d6a5e8f9c2d3e1a4b7c8d9e0f1a2b';

const BACKGROUNDS = [
  '/images/bg-1.svg',
  '/images/bg-2.svg',
  '/images/bg-3.svg',
  '/images/bg-4.svg',
  '/images/bg-5.svg',
];

const WIDTH = 320;
const HEIGHT = 180;
const PIECE_SIZE = 48;

export default function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const bg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

  // Gap X: piece slides left-to-right, so gap can be anywhere from (PIECE_SIZE+10) to (WIDTH-PIECE_SIZE-10)
  // Piece starts at x=0, so gap must be > PIECE_SIZE
  const minGapX = PIECE_SIZE + 16;
  const maxGapX = WIDTH - PIECE_SIZE - 8;
  const gapX = Math.floor(minGapX + Math.random() * (maxGapX - minGapX));

  // Gap Y: random vertical position
  const minGapY = 12;
  const maxGapY = HEIGHT - PIECE_SIZE - 12;
  const gapY = Math.floor(minGapY + Math.random() * (maxGapY - minGapY));

  const issuedAt = Date.now();
  const challengeId = crypto.randomBytes(16).toString('hex');

  const payload = `${challengeId}|${gapX}|${gapY}|${issuedAt}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

  return res.status(200).json({
    challengeId,
    background: bg,
    width: WIDTH,
    height: HEIGHT,
    pieceSize: PIECE_SIZE,
    gapX,
    gapY,
    issuedAt,
    signature,
  });
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
