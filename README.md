# AusClear CAPTCHA

Custom slider puzzle CAPTCHA. Self-hosted. No third-party dependencies. 

## How it looks

A 320×180 dark-luxury background image with a puzzle-shaped gap cut into it. A matching puzzle piece sits at the left. User drags a slider (or the piece directly) to slot the piece into the gap. Server verifies position accuracy AND the drag trajectory looks human.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/challenge` | Issue a signed challenge (puzzle parameters) |
| POST | `/api/verify` | Validate a drop attempt, issue one-time token |
| POST | `/api/validate-token` | Forms call this before submitting, to confirm token is genuine and fresh |
| GET | `/widget.js` | Drop-in JS widget for any form |
| GET | `/images/bg-*.svg` | Background images (5 variants) |

## Integration in a form

```html
<script src="https://ausclear-captcha.vercel.app/widget.js"></script>
<div id="captcha"></div>
<script>
  AusclearCaptcha.mount('#captcha', {
    onSuccess: (token) => {
      window.captchaToken = token;
      // Enable your submit button
    },
    onFail: () => {
      window.captchaToken = null;
    }
  });
</script>
```

On form submit:

```javascript
const r = await fetch('https://ausclear-captcha.vercel.app/api/validate-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: window.captchaToken })
});
const result = await r.json();
if (result.success) {
  // Proceed with form submission to Zoho
} else {
  alert('CAPTCHA expired - please complete it again');
}
```

## Bot defences

The verify endpoint rejects an attempt if any of these are true:

1. **Signature mismatch** — challenge wasn't issued by this server
2. **Expired** — > 5 minutes since challenge was issued
3. **Wrong position** — dropped X is > 6px from real gap X
4. **No trajectory** — fewer than 4 trajectory points (bots often send 2)
5. **Too fast** — total drag time < 350ms
6. **Straight-line motion** — zero direction reversals over an 8+ point trajectory (humans wiggle, bots don't)

If all checks pass, server issues an HMAC-signed token valid for 5 minutes, single-use per Lambda instance.

## Keys

- `CAPTCHA_SECRET` — for signing challenges
- `TOKEN_SECRET` — for signing one-time tokens after solving

Both have hardcoded defaults; set via Vercel environment variables for production.
