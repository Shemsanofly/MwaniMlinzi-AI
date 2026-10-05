import { env } from '../src/config/env.js';
import { createEmailProvider } from '../src/providers/emailProvider.js';

const provider = createEmailProvider();
if (!provider.configured) {
  const missing = ['host', 'from', ...(env.email.user && !env.email.password ? ['password'] : []), ...(env.email.password && !env.email.user ? ['user'] : [])]
    .filter((key) => !env.email[key]).map((key) => `SMTP_${key.toUpperCase()}`);
  console.error(`Email sender unavailable. Configure ${missing.join(', ') || 'valid SMTP settings'} in backend/.env.`);
  console.error('Use your email provider settings; see docs/EMAIL.md. No email was sent.');
  process.exitCode = 1;
} else {
  try {
    await provider.transport.verify();
    console.log('SUCCESS: SMTP connection and authentication verified. No email was sent.');
    console.log('Request a reset for a real registered email and check the inbox to verify delivery.');
  } catch (error) {
    console.error(`SMTP verification failed (${['EAUTH', 'ETIMEDOUT', 'ECONNECTION', 'EDNS', 'ESOCKET'].includes(error.code) ? error.code : 'EMAIL_CONNECTION_FAILED'}). Check the provider settings in backend/.env.`);
    process.exitCode = 1;
  }
}
