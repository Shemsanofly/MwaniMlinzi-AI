import { env } from '../config/env.js';

/**
 * USSDProvider interface: formats menu responses for the gateway and parses inbound requests.
 * USSD is gateway-initiated, so "live" means accepting a gateway callback (Africa's Talking format:
 * sessionId, phoneNumber, serviceCode, text; reply "CON …" to continue or "END …" to finish).
 * The simulator uses the exact same protocol, so the same state machine serves both.
 */
export class SimulatedUSSDProvider {
  name = 'simulated-ussd';
  isLive = false;
  parse(body) {
    return { sessionId: String(body.sessionId), phoneNumber: String(body.phoneNumber), text: String(body.text ?? ''), serviceCode: body.serviceCode || '*123#' };
  }
  format({ text, end }) { return `${end ? 'END' : 'CON'} ${text}`; }
}

export class AfricasTalkingUSSDProvider extends SimulatedUSSDProvider {
  name = 'africastalking-ussd';
  isLive = true;
}

export function createUSSDProvider(config = env) {
  if (!config.demoMode && config.ussd.provider === 'africastalking') return new AfricasTalkingUSSDProvider();
  return new SimulatedUSSDProvider();
}
