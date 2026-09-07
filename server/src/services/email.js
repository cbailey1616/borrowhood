import { Resend } from 'resend';
import { logger } from '../utils/logger.js';
import { socialLinkCodeEmail, resetCodeEmail, accountHintEmail } from './emailTemplates.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = 'Borrowhood <noreply@borrowhood.net>';
const REPLY_TO = 'chris@borrowhood.net';

async function sendMail(to, message) {
  if (!resend) throw new Error('Email service unavailable');
  try {
    const result = await resend.emails.send({ from: FROM, replyTo: REPLY_TO, to, ...message });
    if (result.error) throw new Error('Email delivery failed');
    logger.info('Account email accepted by provider');
  } catch {
    // Provider errors can contain message bodies. Never log account codes or recipients.
    logger.error('Account email delivery failed');
    throw new Error('Email delivery failed');
  }
}

export async function sendSocialLinkCodeEmail(to, code, provider) {
  await sendMail(to, socialLinkCodeEmail(code, provider));
}

export async function sendResetCodeEmail(to, code) {
  await sendMail(to, resetCodeEmail(code));
}

export async function sendAccountHintEmail(to, providers) {
  await sendMail(to, accountHintEmail(providers));
}
