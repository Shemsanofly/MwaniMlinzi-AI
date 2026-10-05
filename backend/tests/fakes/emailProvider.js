/** Test-only email transport; never contacts a real mail server. */
export class FakeEmailProvider {
  name = 'fake-email';
  configured = true;
  sent = [];
  nextStatus = 'SENT';
  async send(message) {
    this.sent.push(message);
    return this.nextStatus === 'SENT'
      ? { status: 'SENT', providerRef: `test-email-${this.sent.length}` }
      : { status: 'FAILED', error: 'EMAIL_SEND_FAILED' };
  }
  to(email) { return this.sent.filter((message) => message.to === email); }
}
