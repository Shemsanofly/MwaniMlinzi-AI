/** In-memory stand-in for the Africa's Talking SMS client (records messages, returns a scripted status). */
export class FakeSMSClient {
  constructor() {
    this.name = 'fake-africastalking';
    this.configured = true;
    this.sent = [];
    this.nextStatus = 'QUEUED';
  }

  async send(to, message) {
    this.sent.push({ to, message });
    const n = this.sent.length;
    if (this.nextStatus === 'FAILED') return { status: 'FAILED', error: 'InvalidPhoneNumber (403)', providerStatus: '403 InvalidPhoneNumber' };
    return { status: this.nextStatus, providerRef: `ATXid_fake_${Date.now()}_${n}`, providerStatus: '101 Success', cost: 'TZS 20.0000' };
  }

  to(phone) { return this.sent.filter((m) => m.to === phone); }
}
