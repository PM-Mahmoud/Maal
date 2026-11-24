'use strict';

// Production cookies use the browser-enforced host-only prefix. The existing
// local cookie remains usable on HTTP development servers.
const secure = process.env.NODE_ENV === 'production';
const name = secure ? '__Host-maal.sid' : 'connect.sid';
const options = { path: '/', httpOnly: true, sameSite: 'lax', secure };

function clearSessionCookie(res) {
  res.clearCookie(name, options);
}

module.exports = { name, options, clearSessionCookie };
