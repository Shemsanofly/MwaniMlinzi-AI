import { Router } from 'express';
import { integrationLimiter } from '../middleware/rateLimit.js';
import * as integrations from '../controllers/integrationController.js';
import * as sarufi from '../controllers/sarufiController.js';

/** External provider callbacks. Mounted before the global API limiter; authenticated by shared secret. */
const r = Router();
r.use(integrationLimiter);
r.post('/africastalking/ussd', integrations.ussd);
r.post('/africastalking/sms', integrations.smsInbound);
r.post('/africastalking/sms/delivery', integrations.smsDelivery);
// Sarufi (WhatsApp gateway): one webhook for every inbound WhatsApp message; the GET is a health probe
// Sarufi's dashboard hits when you paste the URL.
r.get('/sarufi/webhook', sarufi.health);
r.post('/sarufi/webhook', sarufi.webhook);
export default r;
