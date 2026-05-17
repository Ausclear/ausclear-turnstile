// api/verify.js
// Cloudflare Turnstile verification endpoint
// Deployed at: https://turnstile.ausclear.au/api/verify
// Used by all AusClear contact forms across all sites.

const TURNSTILE_SECRET = '0x4AAAAAADRAwoqpMLoXiNM5CM20t6pJkAU';
const CLOUDFLARE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Origins permitted to use this endpoint.
// Tokens issued for any of these hostnames will validate successfully
// (the Turnstile widget itself already enforces hostname allowlist on the
// Cloudflare side; this list is for CORS only).
const ALLOWED_ORIGINS = [
  'https://ausclear.com.au',
  'https://www.ausclear.com.au',
  'https://support.ausclear.au',
  'https://www.support.ausclear.au',
  'https://portal.ausclear.au',
];

export default async function handler(req, res) {
  // CORS — reflect the request origin if allowed, otherwise use the canonical site
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { token } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Missing token'
    });
  }

  // Get client IP (Vercel forwards via x-forwarded-for)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined;

  // Build verification body for Cloudflare
  const formData = new URLSearchParams();
  formData.append('secret', TURNSTILE_SECRET);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  try {
    const cfResponse = await fetch(CLOUDFLARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    const data = await cfResponse.json();

    if (data.success === true) {
      return res.status(200).json({
        success: true,
        hostname: data.hostname,
        action: data.action,
      });
    }

    return res.status(200).json({
      success: false,
      message: 'Verification failed',
      codes: data['error-codes'] || [],
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      message: 'Verification service unavailable'
    });
  }
}
