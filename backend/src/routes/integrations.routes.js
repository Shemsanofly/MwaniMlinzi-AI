import { Router } from 'express';
import { integrationLimiter } from '../middleware/rateLimit.js';
import * as integrations from '../controllers/integrationController.js';

/** External provider callbacks. Mounted before the global API limiter; authenticated by shared secret. */
const r = Router();
r.use(integrationLimiter);
r.post('/africastalking/ussd', integrations.ussd);
r.post('/africastalking/sms', integrations.smsInbound);
r.post('/africastalking/sms/delivery', integrations.smsDelivery);
export default r;
