function databaseSsl(connectionString) {
  try {
    const hostname = new URL(connectionString).hostname;
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;
    if (process.env.DATABASE_SSL_INSECURE === 'true') {
      return { rejectUnauthorized: false };
    }
    return process.env.DATABASE_CA_CERT
      ? { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT }
      : { rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

module.exports = { databaseSsl };
