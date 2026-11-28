'use strict';

const { sendEmail } = require('./email');
const { safeError } = require('../lib/safe-log');

async function sendOtpEmail(email, name, otp) {
  const firstName = (name || '').split(' ')[0] || 'there';
  const greeting = firstName.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;max-width:560px;width:100%;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:1.4rem;font-weight:600;color:#C9A84C;">◈ Maal</p>
          <h1 style="margin:0 0 12px;font-size:1.4rem;font-weight:600;">Your verification code</h1>
          <p style="margin:0 0 28px;font-size:0.9rem;color:#8A8D83;line-height:1.6;">Hi ${greeting}, enter this code to verify your email address. It expires in 10 minutes.</p>
          <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#C9A84C;">${otp}</span>
          </div>
          <p style="margin:0;font-size:0.78rem;color:#8A8D83;">If you didn't create a Maal account, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  sendEmail({ to: email, subject: 'Your Maal verification code', html, text: `Your Maal verification code: ${otp}\nExpires in 10 minutes.` })
    .catch(err => console.error('[auth] OTP email FAILED — user will not receive their code and will be stuck at /verify-email. Check RESEND_API_KEY / EMAIL_FROM (verified domain) in the host env and Resend dashboard Logs. Error:', safeError(err)));
}

module.exports = { sendOtpEmail };
