'use strict';

const bcrypt = require('bcryptjs');
const { findUserByEmail } = require('../db/users');
const { recordPasswordFailure } = require('../db/account-unlock');
const { generateResetToken } = require('../lib/auth-tokens');
const { safeError } = require('../lib/safe-log');
const { sendEmail } = require('./email');

const LOGIN_ERROR = 'Email or password is incorrect';
const FAILED_ATTEMPT_LIMIT = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
// This valid work-factor-12 hash is only used to equalise comparison work.
const DUMMY_HASH = '$2b$12$LOzytFjHlAxJIx4MpO5Kp.Mh39Lwuecb4xQ0oyFbM9pLSvm2SvGSC';

async function sendUnlockEmail(email, token) {
  const url = new URL('/unlock-account', process.env.BASE_URL || 'https://hellomaal.com');
  url.searchParams.set('token', token);
  await sendEmail({
    to: email,
    subject: 'Unlock your Maal account',
    text: `There were several unsuccessful Maal sign-in attempts. This single-use link lets you unlock your account and expires in 15 minutes.\n\n${url}\n\nIf you did not try to sign in, you can ignore this email.`,
  });
}

async function verifyPasswordLogin(email, password) {
  const user = await findUserByEmail(email);
  const locked = user?.locked_until && new Date(user.locked_until).getTime() > Date.now();
  const canCheckAccount = !!user?.password_hash && !locked;
  const valid = await bcrypt.compare(password, canCheckAccount ? user.password_hash : DUMMY_HASH);
  if (!canCheckAccount) return null;
  if (valid) return user;

  const { token, hash } = generateResetToken();
  const lockedNow = await recordPasswordFailure(user.id, user.password_hash, {
    maxAttempts: FAILED_ATTEMPT_LIMIT,
    expiresAt: new Date(Date.now() + LOCK_DURATION_MS),
    tokenHash: hash,
  });
  if (lockedNow) {
    setImmediate(() => {
      sendUnlockEmail(user.email, token).catch(error => {
        console.error('[auth] Account unlock email failed:', safeError(error));
      });
    });
  }
  return null;
}

module.exports = { LOGIN_ERROR, verifyPasswordLogin };
