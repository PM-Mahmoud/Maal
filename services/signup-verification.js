'use strict';

const { randomInt } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createUser, findUserByEmail, setOtp, setPhone } = require('../db/users');
const waitlist = require('./waitlist-access');
const { onSignup } = require('./referrals');
const { sendOtpEmail } = require('./auth-otp-email');
const { sendEmail } = require('./email');
const { safeError } = require('../lib/safe-log');

const OTP_TTL_MS = 10 * 60 * 1000;

async function requestSignup(req, { email, name, password, phone }) {
  if (!(await waitlist.canSignUp(email, req.session.referralCode))) return false;

  const passwordHash = password == null ? null : await bcrypt.hash(password, 12);
  let user = await findUserByEmail(email);
  delete req.session.pendingPhone;
  if (!user) {
    let created = false;
    try {
      user = await createUser({ email, name, passwordHash, provider: 'credentials' });
      created = true;
    } catch (error) {
      // A concurrent successful signup follows the ordinary existing-account path.
      if (error.code !== '23505') throw error;
      user = await findUserByEmail(email);
      if (!user) throw error;
    }
    if (created) {
      await waitlist.recordJoined(email);
      await onSignup(req, user);
      if (typeof phone === 'string' && phone.trim()) {
        await setPhone(user.id, phone.trim());
        req.session.pendingPhone = phone.trim();
      }
    }
  }

  if (user.email_verified) {
    sendEmail({
      to: user.email,
      subject: 'Continue to Maal',
      text: 'This address already has a Maal account. Sign in or request a reset link from the Maal sign-in page. If you did not request this email, you can ignore it.',
    }).catch(error => console.error('[signup] Existing account email failed:', safeError(error)));
  } else {
    const code = String(randomInt(100000, 1000000));
    await setOtp(user.id, code, new Date(Date.now() + OTP_TTL_MS));
    await sendOtpEmail(email, user.name, code);
  }

  req.session.pendingEmail = email;
  req.session.otpPurpose = 'signup';
  delete req.session.postLoginRedirect;
  return true;
}

module.exports = { requestSignup };
