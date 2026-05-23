/**
 * Email service — owns: outbound transactional emails via Polsia email proxy
 * Does NOT own: email template storage, user data, route handling
 */
const https = require('https');
const http = require('http');

/**
 * Send a POST request to the Polsia email proxy.
 * Proxy URL: POLSIA_EMAIL_PROXY_URL
 * Auth: POLSIA_API_KEY as Bearer token
 */
function sendEmail({ to, from, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const proxyUrl = process.env.POLSIA_EMAIL_PROXY_URL;
    if (!proxyUrl) {
      return reject(new Error('POLSIA_EMAIL_PROXY_URL not set'));
    }

    const apiKey = process.env.POLSIA_API_KEY || process.env.POLSIA_API_TOKEN;
    const payload = JSON.stringify({ to, from, subject, html, text });

    const url = new URL(proxyUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${apiKey}`,
      },
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Email proxy responded ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send the waitlist confirmation email to a newly signed-up user.
 */
async function sendWaitlistConfirmation(email) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the Ethical waitlist</title>
</head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 24px;font-size:1.5rem;font-weight:600;color:#F0EFE9;">◈ Ethical</p>
              <h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:600;color:#F0EFE9;line-height:1.3;">You're on the Ethical waitlist.</h1>
              <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
                Early access is coming for Australian health professionals — doctors, pharmacists, dentists, and nurses who want a CFO-level view of their finances with halal or ESG compliance built in.
              </p>
              <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
                When your spot is ready, you'll be the first to know. No spam, no noise — just the launch notification.
              </p>
              <p style="margin:0;font-size:0.85rem;color:rgba(138,141,131,0.6);line-height:1.5;">
                Ethical is for informational purposes only and does not constitute personal financial advice. Always seek advice from a qualified financial adviser.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `You're on the Ethical waitlist.\n\nEarly access is coming for Australian health professionals — doctors, pharmacists, dentists, and nurses who want a CFO-level view of their finances with halal or ESG compliance built in.\n\nWhen your spot is ready, you'll be the first to know.\n\nEthical — halalmetrics.polsia.app`;

  return sendEmail({
    to: email,
    from: 'noreply@halalmetrics.polsia.app',
    subject: "You're on the Ethical waitlist",
    html,
    text,
  });
}

module.exports = { sendEmail, sendWaitlistConfirmation };
