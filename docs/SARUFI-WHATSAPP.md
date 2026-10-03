# WhatsApp chatbot via Sarufi

MwaniMlinzi speaks the same 5-menu flow farmers know from USSD on WhatsApp too, using [Sarufi](https://sarufi.io) as the
WhatsApp gateway. Sarufi handles the Meta WhatsApp Cloud API integration for us; every incoming WhatsApp message is
forwarded to our backend, which replies with the same content the USSD menu serves. Farmers with a smartphone (or a
featurephone that can install WhatsApp) get a richer version of the same product.

## 1. How it works

```
Farmer WhatsApps +255 753 790 797
      │
      ▼
Meta WhatsApp Cloud API ── forwarded by Sarufi ──▶  POST /api/integrations/sarufi/webhook?secret=…
                                                       ◀── JSON { message: "reply text" }
Sarufi sends the reply back to the farmer over WhatsApp.
```

| Part | Code |
|---|---|
| Webhook endpoint (secret, validation, session lookup) | `backend/src/controllers/sarufiController.js` |
| WhatsApp menu state machine (mirrors USSD) | `backend/src/services/whatsappService.js` |
| Persisted per-phone conversation state | `whatsapp_sessions` table |
| Reused services: risk, records, outlook | same modules USSD uses — one product, two channels |

## 2. Environment variables (`backend/.env`, never committed)

| Variable | Sandbox value | Meaning |
|---|---|---|
| `SARUFI_WEBHOOK_SECRET` | long random string | **Required.** Appended to Sarufi's webhook URL as `?secret=…`; every incoming request is refused if it does not match. Generate with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. |
| `SARUFI_BOT_PHONE` | `+255753790797` | The WhatsApp Business number that hosts the bot. Used only for display in Admin → Integrations. |

There is nothing else. Sarufi holds the Meta credentials for us; the backend only needs the shared webhook secret.

## 3. Signup and setup (browser + phone, ~45 min)

**Do these in order. Steps 1-4 are for you; step 5 is where I take over.**

### Step 1 — Delete WhatsApp on the business number
Meta refuses to register a number for WhatsApp Business API if it already has a consumer WhatsApp account.

1. On the phone with SIM `+255 753 790 797`, open WhatsApp.
2. Settings → Account → Delete My Account. Enter the number, tap Delete.
3. Uninstall WhatsApp on that phone.
4. **Keep the SIM active in a phone that can receive SMS or voice calls** — Meta sends the WhatsApp Business API verification code by SMS or voice in step 3.

If you skip this, the Meta verification step in section 3 will fail with "This number is already registered on WhatsApp".

### Step 2 — Create your Sarufi account
1. Open https://sarufi.io in a browser.
2. Click **Sign up**, use a work email, verify it.
3. Sign in → **Create Chatbot**. Name it "MwaniMlinzi", set language to Swahili (English fallback), and pick a minimal empty template.
4. Sarufi shows a bot dashboard. Note the **Bot ID** shown at the top; you will need it later.
5. Go to your account settings (top-right menu) → **API Keys** (or similar) → note down **CLIENT_ID** and **CLIENT_SECRET**. Keep them somewhere safe; treat them like passwords.

### Step 3 — Register the number with WhatsApp Business
Sarufi wraps Meta's Cloud API, so you register through Sarufi (recommended) OR directly on Meta.

**The Sarufi-guided path (easiest):**
1. In Sarufi bot dashboard → **Channels** or **Integrations** → **WhatsApp** → **Connect**.
2. Sarufi will ask for either your own Meta Business credentials, or offer to route through Sarufi's own Meta Business account for a small fee. For a demo, taking Sarufi's route is fastest; for production, use your own Meta Business account so you own the number.
3. Enter `+255753790797` when asked for the phone number.
4. Meta sends a verification code by SMS or voice call to that number. Enter it in the Sarufi UI.
5. Sarufi confirms the WhatsApp channel is **Connected**. You now have a bot on `+255 753 790 797`.

**The direct-Meta path (more setup, full control):**
This is the harder route — requires a Meta Business Manager, a Business Verification (business documents), a Meta WhatsApp Business Account (WABA), a Cloud API app, and generating a permanent access token. Only pick this if you already have a verified Meta Business account. Otherwise use the Sarufi-guided path above.

### Step 4 — Tell me the webhook secret and Bot ID
Before Sarufi can forward messages to us, we need to give it a webhook URL. But first, generate the secret:

1. In a terminal in `backend/`, run:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
2. Copy the string, add these two lines to `backend/.env`:
   ```
   SARUFI_WEBHOOK_SECRET=<that string>
   SARUFI_BOT_PHONE=+255753790797
   ```
3. Restart the backend.
4. Make sure ngrok is running (as for USSD): `ngrok http 5000`. Copy the `https://…ngrok-free.app` URL.
5. In Sarufi dashboard → your bot → **Webhook** or **Settings → Advanced**, paste this URL:
   ```
   https://<your-ngrok>.ngrok-free.app/api/integrations/sarufi/webhook?secret=<SARUFI_WEBHOOK_SECRET>
   ```
6. Save. Sarufi will make a test `GET`/`POST` to that URL to verify the connection. The backend returns 200 for a well-formed request with the right secret.

### Step 5 — Test end-to-end
From any phone (yours, a friend's, an emulator) send a WhatsApp message to `+255 753 790 797`. Try:
- `hi` or `mambo` → welcome + main menu (5 numbered options)
- `1` → Farm status submenu
- `1 1` or just `1` again → risk for your first farm
- `report ice-ice` → symptom report shortcut
- `msaada` → help

Every reply is served by the same backend services USSD uses. The exchange is logged in `whatsapp_sessions` with masked phone number and per-request timestamps.

## 4. The WhatsApp menu

Same content as the USSD menu (deck slide 8) with WhatsApp-friendlier text (no 182-char limit, so the reply can be
longer and formatted). Farmers who already learned the USSD menu see the same numbers on WhatsApp:

```
MWANIMLINZI kwenye WhatsApp

1. Hali ya shamba
2. Tahadhari
3. Ripoti tatizo
4. Rekodi mavuno
5. Msaada

Andika namba au andika swali lako moja kwa moja (mfano: "hatari ya FARM002", "mavuno 120", "msaada").
```

Free-text keywords also work in either language (`hatari`, `ripoti`, `msaada`, `mavuno`, and `risk`, `report`,
`help`, `harvest`), so a farmer who has never seen a menu can still get an answer.

## 5. Sending WhatsApp from the backend (Phase 2)

Right now the bot only replies to incoming messages — a farmer must WhatsApp first. To push proactive alerts
(like the risk-alert SMS we already send), Meta requires pre-approved **Message Templates** and staying inside the
24-hour customer-service window per user. This is a Phase 2 feature; sketch:

1. Register templates in Meta Business Manager (or via Sarufi if it exposes them).
2. Add `WhatsAppService.sendTemplate(user, templateName, params)` mirroring `SMSService.sendToUser`.
3. `NotificationService.notifyUser` picks the channel per user preference.

Not shipped yet.

## 6. Troubleshooting

- **Sarufi says the webhook is unreachable:** ngrok tunnel is down, or you pasted the wrong URL. Reopen ngrok, copy the new URL, update Sarufi.
- **Sarufi says "Invalid secret":** the `?secret=` in the URL does not match `SARUFI_WEBHOOK_SECRET`. Fix one side.
- **Farmer says the bot never replied:** check Admin → Integrations → Sarufi for the last event and its status.
  `REJECTED` = wrong/missing secret. `ERROR` = the backend errored (see server logs). `OK` = we replied; Sarufi is the next place to check.
- **Reply arrives, but next message doesn't continue the flow:** WhatsApp session TTL is 30 minutes; after that a fresh "hi" starts over. That is intended.
- **You want to change the welcome text or menu:** edit `backend/src/services/whatsappService.js`.
