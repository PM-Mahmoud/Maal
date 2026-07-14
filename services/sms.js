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

// ─── Inbound SMS → advisor (PR 10) ─────────────────────────────────────────
// Handle a validated inbound SMS: match the sender to a user, meter it against
// the advisor-message budget, run advisor.chat(), and return the reply split
// into SMS-sized chunks. The Twilio-signature check + feature flag live at the
// route; this function assumes an already-authenticated inbound message.
async function handleInboundSms({ from, body }) {
  const { splitSms } = require('../lib/twilio-sms');
  const text = String(body || '').trim();
  if (!text) return { messages: [] };

  const { findUserByPhone } = require('../db/users');
  const user = await findUserByPhone(from);
  if (!user) {
    return { messages: ['This number isn\'t linked to a Maal account. Reply from the mobile number registered on your Maal profile to chat with Maal.'] };
  }

  // Meter against the advisor-message budget (SMS shares it). Free tier = 0.
  const planLimits = require('../lib/plan-limits');
  const usageDb = require('../db/usage');
  const plan = planLimits.normalizePlan(user.plan);
  const limit = planLimits.limitFor(plan, 'advisor_messages');
  if (limit <= 0) {
    return { messages: [planLimits.upgradeMessage(plan, 'advisor_messages')] };
  }
  try {
    const newCount = await usageDb.incrementIfUnder(user.id, 'advisor_messages', limit);
    if (newCount === null) {
      return { messages: [planLimits.upgradeMessage(plan, 'advisor_messages')] };
    }
  } catch (e) {
    // Fail open on infra errors (consistent with the HTTP metering path).
    console.error('[sms] metering failed open:', e.message);
  }

  const advisor = require('./advisor');
  if (!advisor.hasAdvisor()) {
    return { messages: ['Maal\'s assistant is temporarily unavailable. Please try again shortly.'] };
  }

  const { getProfileByUserId } = require('../db/profiles');
  const assetsDb = require('../db/assets');
  const { computeMaalScore } = require('../lib/maal-score');
  const rawProfile = (await getProfileByUserId(user.id)) || {};
  const assetSummary = await assetsDb.getAssetSummary(user.id);
  const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
  const maal = computeMaalScore(profile);

  // chat() is the text-only (SMS/email) surface — no generative UI.
  const reply = await advisor.chat(user, profile, maal, [{ role: 'user', content: text }], [], {});
  return { messages: splitSms(reply, 1400) };
}

module.exports = { sendSms, sendOtpSms, handleInboundSms };
