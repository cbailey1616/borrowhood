import { Router } from 'express';

const router = Router();
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/.well-known/apple-app-site-association', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    applinks: {
      apps: [],
      details: [{ appID: '8H5NL2H27M.com.borrowhood.app', paths: ['/people/*'] }],
    },
  });
});

// No account lookup or action here. Profile information and friendship actions
// remain behind the app's existing authenticated APIs.
router.get('/people/:id', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.params.id.length !== 36 || !PROFILE_ID.test(req.params.id)) return res.status(404).type('text').send('Profile link not found.');
  const appLink = `borrowhood://people/${req.params.id.toLowerCase()}`;
  res.type('html').send(`<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-itunes-app" content="app-id=6758581435, app-argument=${appLink}">
  <title>Add a friend · Borrowhood</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #F3EBDD; color: #343E35; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
    main { width: 100%; max-width: 420px; padding: 32px 24px; border-radius: 24px; background: #FBF6EC; text-align: center; box-shadow: 0 2px 12px #32483c0a; }
    .brand { color: #42594C; font-size: 18px; margin: 0 0 28px; }
    h1 { font-size: 28px; font-weight: 500; margin: 0 0 12px; }
    p { color: #5D6659; line-height: 1.5; margin: 0 0 24px; }
    a { color: #42594C; display: block; padding: 16px; border-radius: 16px; text-decoration: none; }
    .open { color: #FBF6EC; background: #42594C; margin-bottom: 8px; }
    a:focus-visible { outline: 3px solid #946200; outline-offset: 3px; }
  </style>
</head><body><main>
  <p class="brand">Borrowhood</p>
  <h1>Add a friend</h1>
  <p>Open their profile in Borrowhood to send a friend request.</p>
  <a class="open" href="${appLink}">Open Borrowhood</a>
  <a href="https://apps.apple.com/app/id6758581435">Download on the App Store</a>
  <p>New here? After installing Borrowhood and signing up, tap your invite link again or scan the QR code again to open their profile.</p>
</main></body></html>`);
});

export default router;
