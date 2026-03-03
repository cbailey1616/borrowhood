import { Resend } from 'resend';
import { logger } from '../utils/logger.js';

// ── Resend Client ───────────────────────────────────────────────────

let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  logger.info('Email configured via Resend');
} else {
  logger.warn('RESEND_API_KEY not set — emails will be logged to console only');
}

const FROM = 'Borrowhood <noreply@borrowhood.net>';

// ── Helpers ─────────────────────────────────────────────────────────

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#2D5A27;padding:24px 32px;">
          <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Borrowhood</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1B3318;font-size:20px;font-weight:700;">${title}</h2>
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f4f0e8;border-top:1px solid #e0d5c0;">
          <p style="margin:0;color:#6B8A66;font-size:12px;">Borrowhood — Your neighborhood sharing community</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendMail({ to, subject, text, html }) {
  if (resend) {
    try {
      await resend.emails.send({ from: FROM, to, subject, text, html });
      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      logger.error(`Failed to send email to ${to}:`, err);
      throw err;
    }
  } else {
    logger.info(`[EMAIL CONSOLE] To: ${to} | Subject: ${subject}`);
    logger.info(`[EMAIL CONSOLE] Body: ${text}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function sendResetCodeEmail(to, code) {
  const subject = 'Your Borrowhood password reset code';
  const text = `Your password reset code is: ${code}\n\nThis code expires in 1 hour. If you didn't request this, you can safely ignore this email.`;
  const html = wrapHtml('Password Reset Code', `
    <p style="margin:0 0 20px;color:#3D5A38;font-size:15px;line-height:1.5;">
      Use the code below to reset your password. It expires in 1 hour.
    </p>
    <div style="background:#f4f0e8;border:2px solid #2D5A27;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1B3318;">${code}</span>
    </div>
    <p style="margin:0;color:#6B8A66;font-size:13px;line-height:1.5;">
      If you didn't request this, you can safely ignore this email. Your password won't change.
    </p>
  `);
  await sendMail({ to, subject, text, html });
}

export async function sendAccountHintEmail(to, providers) {
  const providerList = providers.length > 0
    ? providers.map(p => p === 'apple' ? 'Apple' : p === 'google' ? 'Google' : p).join(' and ')
    : null;

  const subject = 'Someone searched for your Borrowhood account';
  const text = `Someone is trying to find your Borrowhood account.\n\nYour account is registered with this email address.${providerList ? ` You can also sign in with ${providerList}.` : ''}\n\nIf this wasn't you, no action is needed.`;
  const html = wrapHtml('Account Lookup', `
    <p style="margin:0 0 16px;color:#3D5A38;font-size:15px;line-height:1.5;">
      Someone is trying to find your Borrowhood account. Your account is registered with this email address.
    </p>
    ${providerList ? `
    <div style="background:#f4f0e8;border-radius:8px;padding:14px 18px;margin:0 0 16px;">
      <p style="margin:0;color:#1B3318;font-size:14px;font-weight:600;">
        You can also sign in with ${providerList}
      </p>
    </div>` : ''}
    <p style="margin:0;color:#6B8A66;font-size:13px;line-height:1.5;">
      If this wasn't you, no action is needed. Your account is safe.
    </p>
  `);
  await sendMail({ to, subject, text, html });
}
