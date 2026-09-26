import { randomBytes } from 'node:crypto';

// Stripe's hosted flow needs a web URL. The public page carries no session or
// identity data and hands control back to the callback supported by build 270.
export const IDENTITY_RETURN_PATH = '/verification-complete';
export const IDENTITY_RETURN_URL = `https://borrowhood-production.up.railway.app${IDENTITY_RETURN_PATH}`;
const APP_RETURN_URL = 'borrowhood://verification-complete';

export function serveIdentityReturn(_req, res) {
  const nonce = randomBytes(18).toString('base64');
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  // Do not infer verification from a visit or query parameters. After returning,
  // the app checks the authenticated status endpoint, which consults Stripe.
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Return to Borrowhood</title>
<style nonce="${nonce}">
  *{box-sizing:border-box}
  body{font-family:-apple-system,system-ui,sans-serif;background:#f3eadb;color:#405b4e;
    display:flex;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;
    margin:0;padding:24px;text-align:center}
  main{width:100%;max-width:380px}
  h1{font-size:30px;font-weight:500;margin:0 0 16px}
  p{color:#626e60;line-height:1.6;margin:0 0 28px}
  a{display:block;padding:16px 24px;border-radius:999px;background:#405b4e;color:#fffaf0;
    font-size:18px;text-decoration:none}
  a:focus-visible{outline:3px solid #405b4e;outline-offset:4px}
</style>
</head><body><main>
<h1>Return to Borrowhood</h1>
<p>Continue in the app to check your verification status.</p>
<a href="${APP_RETURN_URL}">Open Borrowhood</a>
</main>
<script nonce="${nonce}">window.location.replace('${APP_RETURN_URL}');</script>
</body></html>`);
}
