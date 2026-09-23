/** EmailProvider abstraction. The MVP ships a simulated provider; plug in SMTP/SendGrid here later. */
export class SimulatedEmailProvider {
  name = 'simulated-email';
  isLive = false;
  async send(to) { return { status: 'SIMULATED', providerRef: `sim-email-${Date.now()}-${String(to).slice(0, 3)}` }; }
}
export const createEmailProvider = () => new SimulatedEmailProvider();
