'use strict';

const https = require('https');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

/**
 * Send an SMS via Twilio REST API (no npm dependency).
 * Silently skips if env vars are not set (dev mode).
 */
async function sendSms(to, body) {
  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[SMS] Twilio env vars not set — skipping SMS send');
    return;
  }

  const data = new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
      timeout: 10000,
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.error('[SMS] Twilio error', res.statusCode, raw);
          reject(new Error(`Twilio ${res.statusCode}`));
        } else {
          resolve(JSON.parse(raw));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('SMS timeout')); });
    req.write(data);
    req.end();
  });
}

async function sendOtpSms(phone, otp) {
  await sendSms(phone, `Your Maal verification code is: ${otp}. It expires in 10 minutes.`);
}

module.exports = { sendSms, sendOtpSms };
