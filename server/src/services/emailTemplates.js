const WEBSITE = 'https://borrowhood.net';
const SUPPORT = 'chris@borrowhood.net';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

// Table layout and inline colors keep account emails usable without images or CSS support.
export function renderEmail({ title, preview, intro, code, expiry, details = [], note }) {
  if (code !== undefined && !/^\d{6}$/.test(String(code))) throw new Error('Invalid email code');
  const paragraph = value => `<p style="margin:0 0 20px;color:#303D34;font-size:16px;line-height:26px;">${escape(value)}</p>`;
  const text = [
    'Borrowhood', title, intro,
    ...(code !== undefined ? [`Your verification code: ${code}`, expiry] : []),
    ...details, note,
    `Need a hand? Contact ${SUPPORT}`,
    `Terms: ${WEBSITE}/terms.html`, `Privacy: ${WEBSITE}/privacy.html`,
  ].filter(Boolean).join('\n\n');
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escape(title)}</title>
<style>@media screen and (max-width:480px){.outer{padding:24px 12px!important}.content{padding:28px 24px!important}.title{font-size:27px!important;line-height:34px!important}}</style>
</head><body style="margin:0;padding:0;background:#F5EDDF;color:#303D34;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#F5EDDF;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5EDDF"><tr><td class="outer" align="center" style="padding:40px 20px;">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 28px;">
<a href="${WEBSITE}" style="color:#415D4E;font-size:30px;font-weight:700;letter-spacing:-1px;text-decoration:none;">Borrowhood<span style="color:#AD944F;">.</span></a>
<p style="margin:8px 0 0;color:#657163;font-size:13px;line-height:20px;">Good things. Closer to home.</p>
</td></tr>
<tr><td class="content" bgcolor="#FCF8EF" style="padding:40px;border:1px solid #DDD6C7;border-radius:24px;">
<p style="margin:0 0 14px;color:#657163;font-size:11px;font-weight:700;letter-spacing:1.5px;line-height:18px;">YOUR BORROWHOOD ACCOUNT</p>
<h1 class="title" style="margin:0 0 20px;color:#415D4E;font-size:32px;font-weight:700;line-height:39px;letter-spacing:-0.6px;">${escape(title)}</h1>
${paragraph(intro)}
${code !== undefined ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr><td align="center" bgcolor="#E6EBDD" style="padding:24px 12px;border:1px solid #D6DECF;border-radius:16px;">
<p style="margin:0 0 12px;color:#415D4E;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:18px;">YOUR VERIFICATION CODE</p>
<p dir="ltr" style="margin:0 0 12px;color:#303D34;font-family:'Courier New',monospace;font-size:36px;font-weight:700;line-height:44px;letter-spacing:6px;">${escape(code)}</p>
<p style="margin:0;color:#415D4E;font-size:13px;line-height:20px;">${escape(expiry)}</p>
</td></tr></table>` : ''}
${details.map(paragraph).join('\n')}
${note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:20px;border-top:1px solid #DDD6C7;"><p style="margin:0;color:#657163;font-size:13px;line-height:21px;">${escape(note)}</p></td></tr></table>` : ''}
</td></tr>
<tr><td align="center" style="padding:24px 16px 0;color:#657163;font-size:12px;line-height:20px;">
<p style="margin:0 0 10px;">Need a hand? <a href="mailto:${SUPPORT}" style="color:#415D4E;text-decoration:underline;">Contact Borrowhood</a></p>
<p style="margin:0 0 10px;">An account email from Borrowhood.</p>
<p style="margin:0;"><a href="${WEBSITE}/terms.html" style="color:#415D4E;text-decoration:underline;">Terms</a> &nbsp;·&nbsp; <a href="${WEBSITE}/privacy.html" style="color:#415D4E;text-decoration:underline;">Privacy</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { text, html };
}

export function socialLinkCodeEmail(code, provider) {
  if (!['apple', 'google'].includes(provider)) throw new Error('Invalid sign-in provider');
  const name = provider === 'apple' ? 'Apple' : 'Google';
  return {
    subject: 'Your Borrowhood sign-in code',
    ...renderEmail({
      title: `Connect ${name}`,
      preview: `One quick step to connect ${name} to your Borrowhood account.`,
      intro: `Enter this code in Borrowhood to connect ${name} to your existing account.`,
      code, expiry: 'This code expires in 10 minutes.',
      details: [`Next time, just tap Continue with ${name} in the app.`],
      note: 'If you did not request this, no action is needed. Keep this code private.',
    }),
  };
}

export function resetCodeEmail(code) {
  return {
    subject: 'Your Borrowhood password reset code',
    ...renderEmail({
      title: 'Reset your password',
      preview: 'Your code to choose a new Borrowhood password.',
      intro: 'Let’s get you back in. Enter this code in Borrowhood to choose a new password.',
      code, expiry: 'This code expires in 1 hour.',
      details: ['Return to the app to finish resetting your password.'],
      note: 'If you did not request a reset, no action is needed and your password will stay the same. Keep this code private.',
    }),
  };
}

export function accountHintEmail(providers = []) {
  const names = [...new Set(providers)].filter(p => ['apple', 'google'].includes(p))
    .map(p => p === 'apple' ? 'Apple' : 'Google');
  return {
    subject: 'Your Borrowhood sign-in options',
    ...renderEmail({
      title: 'Let’s get you back in',
      preview: 'Here’s how to sign in to your Borrowhood account.',
      intro: 'Someone requested help finding your Borrowhood account. This is the email address associated with it.',
      details: names.length
        ? [`Open Borrowhood and choose Continue with ${names.join(' or Continue with ')} to sign in.`]
        : ['Open Borrowhood and sign in with this email address and your Borrowhood password. If you do not remember your password, tap Forgot password to reset it.'],
      note: 'If you did not request this, no action is needed. Your account settings have not changed.',
    }),
  };
}

// Used only by email/password signup; Apple and Google verify emails with their providers.
export function signupCodeEmail(code) {
  return {
    subject: 'Confirm your Borrowhood email',
    ...renderEmail({
      title: 'Welcome to Borrowhood',
      preview: 'Confirm your email to finish creating your account.',
      intro: 'A little sharing starts here. Enter this code in Borrowhood to confirm your email and continue signing up.',
      code, expiry: 'This code expires in 10 minutes.',
      note: 'If you did not sign up for Borrowhood, no action is needed. Keep this code private.',
    }),
  };
}
