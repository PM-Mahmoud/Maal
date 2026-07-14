/**
 * Email service — uses Resend for reliable transactional delivery.
 *
 * Required environment variable:
 *   RESEND_API_KEY  — get one free at https://resend.com (100 emails/day free)
 *
 * Setup:
 *   1. Sign up at resend.com
 *   2. Create an API key (Sending access)
 *   3. Add RESEND_API_KEY to your Render environment variables
 *   4. Optional: verify your domain in Resend for custom from address
 *
 * If RESEND_API_KEY is missing, emails are skipped silently (app still works).
 */

const https = require('https');

// attachments: optional [{ filename, content }] where content is base64 (Resend's
// attachment shape). Used by the AI-generated-files feature (PR 11).
async function sendEmail({ to, subject, html, text, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', to);
    return;
  }

  const fromAddress = process.env.EMAIL_FROM || 'Maal <onboarding@resend.dev>';

  const body = { from: fromAddress, to, subject, html, text };
  if (Array.isArray(attachments) && attachments.length) body.attachments = attachments;
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          const err = new Error(`Resend API error ${res.statusCode}: ${body}`);
          console.error('[email] Send failed:', err.message);
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

async function sendWaitlistConfirmation(email) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're on the Maal waitlist</title></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="padding:40px 40px 32px;">
          <p style="margin:0 0 24px;font-size:1.5rem;font-weight:600;color:#C9A84C;">◈ Maal</p>
          <h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:600;color:#F0EFE9;">You're on the Maal waitlist.</h1>
          <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">Early access is coming for everyday Australians. When your spot is ready, you'll be the first to know.</p>
          <p style="margin:0;font-size:0.85rem;color:rgba(138,141,131,0.6);line-height:1.5;">Maal is for informational purposes only and does not constitute personal financial advice.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  return sendEmail({
    to: email,
    subject: "You're on the Maal waitlist",
    html,
    text: `You're on the Maal waitlist.\n\nEarly access is coming for everyday Australians. When your spot is ready, you'll be the first to know.`,
  });
}

// Email a generated data file (CSV / Excel / PDF) as an attachment (PR 11).
async function sendGeneratedFile(user, file) {
  if (!user || !user.email || !file || !file.base64) return;
  const baseUrl = (process.env.BASE_URL || 'https://hellomaal.com').replace(/\/+$/, '');
  const title = file.title || 'Your Maal export';
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;">
    <p style="font-size:1.2rem;font-weight:700;color:#12B5A6;margin:0 0 4px;">Maal</p>
    <h1 style="font-size:1.2rem;font-weight:700;color:#0E0E10;margin:0 0 12px;">${escapeHtmlLite(title)}</h1>
    <p style="margin:0 0 16px;color:#333;font-size:0.95rem;line-height:1.6;">Your file is attached (<b>${escapeHtmlLite(file.filename)}</b>), generated from your own Maal data.</p>
    <p style="margin:0 0 20px;"><a href="${baseUrl}/app" style="background:#0E0E10;color:#fff;padding:0.6rem 1.2rem;border-radius:8px;text-decoration:none;font-size:0.9rem;">Open Maal</a></p>
    <p style="font-size:0.72rem;color:#888;">Education only — not financial advice.</p>
  </div>`;
  const text = `${title}\nYour file is attached (${file.filename}), generated from your own Maal data.\n${baseUrl}/app\n\nEducation only — not financial advice.`;
  return sendEmail({
    to: user.email,
    subject: title,
    html,
    text,
    attachments: [{ filename: file.filename, content: file.base64 }],
  });
}

function escapeHtmlLite(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

module.exports = { sendEmail, sendWaitlistConfirmation, sendGeneratedFile };
