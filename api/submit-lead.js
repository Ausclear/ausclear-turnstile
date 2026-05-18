// api/submit-lead.js
// Receives form submissions, verifies Turnstile, then creates a Lead in Zoho CRM via OAuth API.
// Zoho's public WebToLeadForm is NOT used — bots have nothing to POST to.

const TURNSTILE_SECRET = '0x4AAAAAADRAwoqpMLoXiNM5CM20t6pJkAU';
const CLOUDFLARE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const ZOHO_CLIENT_ID = '1000.57XM0OOBWZHPCV60VN2ZEC9AV4P80N';
const ZOHO_CLIENT_SECRET = 'c600ba642721a316b6689da2b3c96230ad6463d7ca';
const ZOHO_REFRESH_TOKEN = '1000.cc0c290f4c0aebf03439116960721d2f.ba8c1468f101c30a59fc6be744df8dab';
const ZOHO_TOKEN_URL = 'https://accounts.zoho.com.au/oauth/v2/token';
const ZOHO_LEADS_URL = 'https://www.zohoapis.com.au/crm/v2/Leads';

// Test bypass secret header — remove before go-live
const TEST_BYPASS_SECRET = 'ausclear-test-2026';

function validateFields(body) {
  const { lastName, email, mobile } = body;
  if (!lastName || lastName.trim().length < 2) return 'Last name is required';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Valid email is required';
  if (mobile) {
    const clean = mobile.replace(/\D/g, '');
    if (clean.length > 0 && (clean.length !== 10 || !clean.startsWith('04'))) {
      return 'Mobile must be a 10-digit Australian number starting with 04';
    }
  }
  return null;
}

async function getZohoAccessToken() {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });
  const res = await fetch(`${ZOHO_TOKEN_URL}?${params.toString()}`, { method: 'POST' });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to obtain Zoho access token');
  return data.access_token;
}

async function createZohoLead(accessToken, fields) {
  const leadData = {
    data: [
      {
        First_Name: fields.firstName || '',
        Last_Name: fields.lastName,
        Email: fields.email,
        Mobile: fields.mobile || '',
        Description: fields.message || '',
        Lead_Source: fields.leadSource || 'Web Site',
        State: fields.state || '',
        Clearance_Type: fields.clearanceType || '',
        Tag: [{ name: 'WebForm' }],
      },
    ],
    trigger: ['workflow'],
  };

  const res = await fetch(ZOHO_LEADS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(leadData),
  });

  const data = await res.json();
  if (!data.data || data.data[0]?.code !== 'SUCCESS') {
    throw new Error(data.data?.[0]?.message || 'Zoho lead creation failed');
  }
  return data.data[0].details.id;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Test-Bypass');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const body = req.body || {};
  const { turnstileToken } = body;
  const testBypass = req.headers['x-test-bypass'] === TEST_BYPASS_SECRET;

  // 1. Verify Turnstile (skip if test bypass header present)
  if (!testBypass) {
    if (!turnstileToken) {
      return res.status(400).json({ success: false, message: 'Missing Turnstile token' });
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined;
    const cfParams = new URLSearchParams({ secret: TURNSTILE_SECRET, response: turnstileToken });
    if (ip) cfParams.append('remoteip', ip);

    try {
      const cfRes = await fetch(CLOUDFLARE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cfParams.toString(),
      });
      const cfData = await cfRes.json();
      if (!cfData.success) {
        return res.status(400).json({ success: false, message: 'Turnstile verification failed' });
      }
    } catch {
      // Fail open if Cloudflare unreachable
    }
  }

  // 2. Validate fields
  const validationError = validateFields(body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  // 3. Create Zoho lead
  try {
    const accessToken = await getZohoAccessToken();
    const leadId = await createZohoLead(accessToken, body);
    return res.status(200).json({ success: true, leadId });
  } catch (err) {
    console.error('Zoho error:', err.message);
    return res.status(502).json({ success: false, message: 'Failed to create lead. Please try again.' });
  }
}
