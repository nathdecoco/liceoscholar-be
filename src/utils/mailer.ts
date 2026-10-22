import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env';

export interface CapturedMail {
  to: string;
  fullName: string;
  kind: 'verify' | 'reset';
  link?: string;
  code?: string;
}

/**
 * Every email is recorded here (even when it is not actually delivered).
 * Tests read it to grab the emailed link or code.
 */
const capturedMails: CapturedMail[] = [];

export function getCapturedMails(): CapturedMail[] {
  return capturedMails;
}

export function clearCapturedMails(): void {
  capturedMails.length = 0;
}

let transporterPromise: Promise<Transporter | null> | null = null;

function fromAddress(): string {
  if (env.mailFrom) return env.mailFrom;
  if (env.smtpUser) return `LiceoSCholar <${env.smtpUser}>`;
  return 'LiceoSCholar <no-reply@liceoscholar.local>';
}

async function getTransporter(): Promise<Transporter | null> {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (env.smtpHost) {
        return nodemailer.createTransport({
          host: env.smtpHost,
          port: env.smtpPort,
          secure: env.smtpSecure,
          auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined
        });
      }

      // No SMTP configured: use a disposable Ethereal inbox so the message can
      // still be opened in a browser during development.
      try {
        const account = await nodemailer.createTestAccount();
        console.log(`[mail] No SMTP_HOST set — using an Ethereal test inbox (${account.user}).`);
        return nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth: { user: account.user, pass: account.pass }
        });
      } catch (error) {
        console.warn('[mail] Could not create an Ethereal inbox; emails will only be logged.', error);
        return null;
      }
    })();
  }
  return transporterPromise;
}

/** Shared HTML shell so every email looks on-brand. */
function emailLayout(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#850d16;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;">
                LiceoSCholar
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function verificationEmailHtml(fullName: string, link: string): string {
  return emailLayout(`
    <p style="margin:0 0 14px;font-size:15px;">Hi ${fullName},</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">
      Welcome to the Liceo de Cagayan University Scholarship portal. Please confirm your
      school email address to activate your account.
    </p>
    <p style="margin:0 0 22px;text-align:center;">
      <a href="${link}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#850d16;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">
        Confirm my email
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 18px;font-size:12px;color:#850d16;word-break:break-all;">${link}</p>
    <p style="margin:0;font-size:12px;color:#9aa5b1;line-height:1.6;">
      If you did not create this account, you can safely ignore this email.
    </p>`);
}

function statusUpdateEmailHtml(fullName: string, status: string): string {
  const isQualified = status === 'Qualified';
  const headline = isQualified ? 'Congratulations!' : 'Application Update';
  const body = isQualified
    ? 'Good news — the Scholarship Office has marked your application as <strong>Qualified</strong>. Please keep an eye on your portal for next steps.'
    : 'The Scholarship Office has reviewed your application and marked it as <strong>Not Qualified</strong>. Thank you for applying to the Liceo de Cagayan University Scholarship Program.';

  return emailLayout(`
    <p style="margin:0 0 14px;font-size:15px;">Hi ${fullName},</p>
    <p style="margin:0 0 14px;font-size:22px;font-weight:bold;color:#850d16;">${headline}</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">
      ${body}
    </p>
    <p style="margin:0 0 22px;text-align:center;">
      <a href="https://liceoscholar.vercel.app/login" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#850d16;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">
        Sign in to LiceoSCholar
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#9aa5b1;line-height:1.6;">
      If you have questions about this decision, please contact the Scholarship Office.
    </p>`);
}

function resetCodeEmailHtml(fullName: string, code: string, ttlMinutes: number): string {
  return emailLayout(`
    <p style="margin:0 0 14px;font-size:15px;">Hi ${fullName},</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">
      Use the code below to reset the password on your LiceoSCholar account.
      It expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.
    </p>
    <p style="margin:0 0 18px;text-align:center;">
      <span style="display:inline-block;padding:14px 28px;border-radius:10px;background:#f7ecec;color:#850d16;font-size:32px;font-weight:bold;letter-spacing:10px;">
        ${code}
      </span>
    </p>
    <p style="margin:0;font-size:12px;color:#9aa5b1;line-height:1.6;">
      If you did not request a password reset, you can safely ignore this email — your
      password will not change.
    </p>`);
}

/**
 * Notifies a student when the scholarship office changes their application status.
 * Never throws.
 */
export async function sendStatusUpdateEmail(
  to: string,
  fullName: string,
  status: 'Qualified' | 'Not Qualified'
): Promise<boolean> {
  // We reuse the 'verify' kind for test capture so existing test utilities work.
  capturedMails.push({ to, fullName, kind: 'verify' });

  return deliver({
    to,
    subject: `LiceoSCholar — Application status: ${status}`,
    text:
      `Hi ${fullName},\n\n` +
      `Your LiceoSCholar application status has been updated to: ${status}.\n\n` +
      'Sign in to the portal to review your application.\n\n' +
      'Thank you.',
    html: statusUpdateEmailHtml(fullName, status),
    devNote: `Application status update for ${to}: ${status}`
  });
}

interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Console line used in development, where nothing is really delivered. */
  devNote: string;
}

/** Delivers one message. Never throws — the API must never fail on mail errors. */
async function deliver(message: OutgoingMail): Promise<boolean> {
  if (env.nodeEnv !== 'production') {
    console.log(`\n✉️  ${message.devNote}\n`);
  }

  if (env.nodeEnv === 'test') {
    return true;
  }

  const transporter = await getTransporter();
  if (!transporter) {
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });

    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) {
      console.log(`[mail] Preview the email here: ${preview}`);
    } else {
      console.log(`[mail] "${message.subject}" sent to ${message.to}`);
    }
    return true;
  } catch (error) {
    console.error(`[mail] Failed to send "${message.subject}" to ${message.to}.`, error);
    return false;
  }
}

/**
 * Sends the "confirm your email" message. Never throws: signup must succeed
 * even when the mail provider is misconfigured or offline.
 */
export async function sendVerificationEmail(
  to: string,
  fullName: string,
  link: string
): Promise<boolean> {
  capturedMails.push({ to, fullName, kind: 'verify', link });

  return deliver({
    to,
    subject: 'Confirm your LiceoSCholar email address',
    text:
      `Hi ${fullName},\n\n` +
      'Welcome to LiceoSCholar. Confirm your school email address by opening this link:\n\n' +
      `${link}\n\n` +
      'If you did not create this account, you can ignore this email.',
    html: verificationEmailHtml(fullName, link),
    devNote: `Verification link for ${to}:\n   ${link}`
  });
}

/** Sends the 4-digit password-reset code. Never throws. */
export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  code: string,
  ttlMinutes: number
): Promise<boolean> {
  capturedMails.push({ to, fullName, kind: 'reset', code });

  return deliver({
    to,
    subject: 'Your LiceoSCholar password reset code',
    text:
      `Hi ${fullName},\n\n` +
      `Your LiceoSCholar password reset code is ${code}.\n` +
      `It expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.\n\n` +
      'If you did not request a password reset, you can ignore this email.',
    html: resetCodeEmailHtml(fullName, code, ttlMinutes),
    devNote: `Password reset code for ${to}: ${code} (expires in ${ttlMinutes} min)`
  });
}
