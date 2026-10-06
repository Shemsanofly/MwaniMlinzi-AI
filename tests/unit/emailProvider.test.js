import net from 'node:net';
import { createEmailProvider, SmtpEmailProvider } from '../../src/server/providers/emailProvider.js';

const config = { host: 'smtp.example.test', port: 587, secure: false, requireTLS: true, user: 'sender', password: 'test-only', from: 'sender@example.test' };
const mail = { to: 'farmer@example.test', subject: 'Password reset', text: 'Your reset code is 123456.' };

describe('SMTP email delivery', () => {
  test('incomplete or invalid settings keep email unavailable', async () => {
    for (const change of [{ host: '' }, { from: '' }, { port: NaN }, { port: 0 }, { port: 65536 }, { password: '' }, { user: '' }]) {
      const provider = createEmailProvider({ ...config, ...change });
      expect(provider.configured).toBe(false);
      expect((await provider.send(mail)).status).toBe('NOT_CONFIGURED');
    }
  });
  test('requires TLS, sets timeouts and keeps SMTP debugging disabled', () => {
    const provider = createEmailProvider(config);
    expect(provider.transport.options).toMatchObject({
      requireTLS: true, secure: false, port: 587,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      debug: false, logger: false, disableFileAccess: true, disableUrlAccess: true,
    });
  });
  test('only reports success when the registered recipient is accepted', async () => {
    let sent;
    const provider = new SmtpEmailProvider(config, { sendMail: async (message) => {
      sent = message;
      return { accepted: [mail.to.toUpperCase()], messageId: 'test-message-id' };
    } });
    expect(await provider.send(mail)).toEqual({ status: 'SENT', providerRef: 'test-message-id' });
    expect(sent).toEqual({ from: config.from, ...mail });
    provider.transport = { sendMail: async () => ({ accepted: [], rejected: [mail.to] }) };
    expect(await provider.send(mail)).toEqual({ status: 'FAILED', error: 'EMAIL_REJECTED' });
  });
  test.each([
    ['EAUTH', 'EMAIL_AUTH_FAILED'], ['ETIMEDOUT', 'EMAIL_TIMEOUT'], ['ECONNECTION', 'EMAIL_SEND_FAILED'],
  ])('sanitizes %s errors so credentials and codes cannot reach logs', async (code, expected) => {
    const provider = new SmtpEmailProvider(config, { sendMail: async () => {
      throw Object.assign(new Error('secret password and reset code 123456'), { code });
    } });
    expect(await provider.send(mail)).toEqual({ status: 'FAILED', error: expected });
  });
  test('submits the message over a real SMTP connection to a local test server', async () => {
    const sockets = new Set();
    const received = [];
    const server = net.createServer((socket) => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      let buffer = '', data = false, message = '';
      socket.write('220 localhost test SMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        while (buffer.includes('\r\n')) {
          const end = buffer.indexOf('\r\n');
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (data) {
            if (line === '.') { received.push(message); message = ''; data = false; socket.write('250 queued\r\n'); }
            else message += `${line}\r\n`;
          } else if (/^(EHLO|HELO)/.test(line)) socket.write('250 localhost\r\n');
          else if (line === 'DATA') { data = true; socket.write('354 send message\r\n'); }
          else if (line === 'QUIT') socket.end('221 goodbye\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      // Plaintext is allowed solely for this isolated, loopback test server.
      const provider = createEmailProvider({ ...config, host: '127.0.0.1', port: server.address().port, user: '', password: '', requireTLS: false });
      expect((await provider.send(mail)).status).toBe('SENT');
      expect(received).toHaveLength(1);
      expect(received[0]).toContain('To: farmer@example.test');
      expect(received[0]).toContain(mail.text);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
