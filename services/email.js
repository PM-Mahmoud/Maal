/**
 * Email service — uses Nodemailer with Gmail SMTP.
 *
 * Required environment variables:
 *   GMAIL_USER      — your Gmail address (e.g. you@gmail.com)
 *   GMAIL_APP_PASS  — Gmail App Password (16 chars, no spaces)
 *                     Generate at: https://myaccount.google.com/apppasswords
 *                     (Requires 2-Step Verification to be enabled on your Google account)
 *
 * If either variable is missing, emails are skipped silently (app still works).
 */
const nodemailer = require('nodemailer');

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

async function sendEmail({ to, from, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[email] GMAIL_USER or GMAIL_APP_PASS not set — skipping email to', to);
    return;
  }

  const fromAddress = process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `Mizan <${fromAddress}>`,
    to,
    subject,
    html,
    text,
  });
}

async function sendWaitlistConfirmation(email) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're on the Mizan waitlist</title></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="padding:40px 40px 32px;">
          <p style="margin:0 0 24px;font-size:1.5rem;font-weight:600;color:#C9A84C;">◈ Mizan</p>
          <h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:600;color:#F0EFE9;line-height:1.3;">You're on the Mizan waitlist.</h1>
          <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
            Early access is coming for Australian health professionals — doctors, pharmacists, dentists, and nurses who want a CFO-level view of their finances with halal or ESG compliance built in.
          </p>
          <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
            When your spot is ready, you'll be the first to know. No spam, no noise — just the launch notification.
          </p>
          <p style="margin:0;font-size:0.85rem;color:rgba(138,141,131,0.6);line-height:1.5;">
            Mizan is for informational purposes only and does not constitute personal financial advice. Always seek advice from a qualified financial adviser.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  const text = `You're on the Mizan waitlist.\n\nEarly access is coming for Australian health professionals. When your spot is ready, you'll be the first to know.\n\nMizan — mizan-ufgq.onrender.com`;

  return sendEmail({
    to: email,
    subject: "You're on the Mizan waitlist",
    html,
    text,
  });
}

module.exports = { sendEmail, sendWaitlistConfirmation };
