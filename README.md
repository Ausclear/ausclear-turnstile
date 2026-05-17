# AusClear Turnstile

Shared Cloudflare Turnstile verification endpoint for all AusClear contact forms.

## Endpoint

```
POST https://ausclear-turnstile.vercel.app/api/verify
```

## Request

```json
{ "token": "<turnstile-token-from-widget>" }
```

## Response (success)

```json
{ "success": true, "hostname": "ausclear.com.au", "action": "enquiry" }
```

## Response (failure)

```json
{ "success": false, "message": "Verification failed", "codes": ["invalid-input-response"] }
```

## Client-side integration

```html
<!-- 1. Load Turnstile script in <head> -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<!-- 2. Render the widget in the form -->
<div class="cf-turnstile"
     data-sitekey="0x4AAAAAADRAwtnbl8MHBAU2"
     data-callback="onTurnstileSuccess"
     data-theme="dark"
     data-action="enquiry"></div>
```

```javascript
let turnstileToken = null;
function onTurnstileSuccess(token) { turnstileToken = token; }

async function handleSubmit() {
  const r = await fetch('https://ausclear-turnstile.vercel.app/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: turnstileToken })
  });
  const result = await r.json();
  if (!result.success) {
    alert('Security check failed. Please try again.');
    if (window.turnstile) turnstile.reset();
    return;
  }
  form.submit();
}
```

## Keys

- **Site key** (public): `0x4AAAAAADRAwtnbl8MHBAU2`
- **Secret key** (server-only): embedded in `/api/verify.js`

## Hostnames

Turnstile widget accepts tokens from:

- ausclear.com.au
- www.ausclear.com.au
- support.ausclear.au
- www.support.ausclear.au

## Deployment

Auto-deployed to Vercel on every push to `main`.
