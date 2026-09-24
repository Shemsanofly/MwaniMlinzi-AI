# Africa's Talking: SMS and USSD

MwaniMlinzi sends real SMS and runs a real USSD menu through [Africa's Talking](https://africastalking.com) (AT).
There are **no simulators in the app**. Without AT credentials, SMS attempts are recorded honestly as
`NOT_CONFIGURED` and nothing is sent. The USSD callback refuses requests until a callback secret is set.

Start with the **AT sandbox**: it is free, needs no real phone, and uses AT's web phone simulator.

## 1. How it works

```
Farmer phone ──USSD──▶ Africa's Talking ──POST form──▶ /api/integrations/africastalking/ussd?secret=…
                                              ◀── "CON …" / "END …" (text/plain)
Farmer phone ──SMS───▶ Africa's Talking ──POST form──▶ /api/integrations/africastalking/sms?secret=…
MwaniMlinzi  ──REST──▶ api(.sandbox).africastalking.com/version1/messaging   (outgoing SMS)
Africa's Talking ──POST delivery report──▶ /api/integrations/africastalking/sms/delivery?secret=…
```

| Part | Code |
|---|---|
| REST client (outgoing SMS) | `backend/src/providers/africastalking/smsClient.js` |
| Configuration and status (never exposes the key) | `backend/src/providers/africastalking/config.js` |
| SMS rules: opt-in, preferences, language, logging, delivery reports | `backend/src/services/smsService.js` |
| USSD state machine, stored in `ussd_sessions` | `backend/src/services/ussdService.js` |
| Incoming SMS commands | `backend/src/services/channelService.js` |
| Callback endpoints: secret, validation, duplicates, logging | `backend/src/controllers/integrationController.js` |

## 2. Environment variables (`backend/.env`, never committed)

| Variable | Sandbox value | Meaning |
|---|---|---|
| `AT_USERNAME` | `sandbox` | AT application username (`sandbox` for the sandbox) |
| `AT_API_KEY` | key from the sandbox settings | Sent only as the `apiKey` header to AT. It never goes to the browser, the logs or the API responses. |
| `AT_ENVIRONMENT` | `sandbox` | `sandbox` → `api.sandbox.africastalking.com`, `production` → `api.africastalking.com` |
| `AT_SMS_SENDER_ID` | *(empty)* | Optional approved sender ID or short code. Empty uses AT's default. |
| `AT_USSD_SERVICE_CODE` | e.g. `*384*1234#` | The code you create in AT. When set, callbacks for other codes are refused. |
| `AT_CALLBACK_SECRET` | long random string | **Required** for all callbacks. Generate it with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. |
| `PUBLIC_API_URL` | `https://your-api.example.org` | Only used to show the full callback URLs in Admin → Settings |

Restart the API after changing `.env`.

## 3. Sandbox setup, step by step

1. **Create an AT account** and open the **Sandbox** app. Its username is `sandbox`.
2. **API key:** in the sandbox, open *Settings → API Key*, generate a key, and put it in `AT_API_KEY`.
3. **Public HTTPS URL:** AT must reach your API from the internet. Deploy the API (see `DEPLOYMENT.md`) or run a tunnel to your local port 5000, for example `cloudflared tunnel --url http://localhost:5000` or `ngrok http 5000`. Put that base URL in `PUBLIC_API_URL`.
4. **USSD channel:** in the sandbox, go to *USSD → Create Channel*, choose a code (for example `*384*1234#`), and set the callback URL to
   `https://<PUBLIC_API_URL>/api/integrations/africastalking/ussd?secret=<AT_CALLBACK_SECRET>`.
   Put the same code in `AT_USSD_SERVICE_CODE`.
5. **Incoming SMS (optional):** in the sandbox, create a short code under *SMS → Shortcodes*, and set its incoming-message callback to
   `https://<PUBLIC_API_URL>/api/integrations/africastalking/sms?secret=<AT_CALLBACK_SECRET>`.
6. **Delivery reports:** under *SMS → SMS Callback URLs → Delivery Reports*, set
   `https://<PUBLIC_API_URL>/api/integrations/africastalking/sms/delivery?secret=<AT_CALLBACK_SECRET>`.
7. **Check the setup:** log in as admin and open **Admin → Settings → Africa's Talking**. It shows the environment, whether SMS and USSD are configured, the callback URLs (with placeholders, never the real secret) and recent activity. **Send test SMS** makes one real API call and shows exactly what AT answered: `QUEUED`/`SENT`, `FAILED` with the reason (for example an authentication error), or `NOT_CONFIGURED`.
8. **Phone simulator:** open AT's sandbox simulator (linked from the sandbox dashboard) and start a phone with a number **registered in MwaniMlinzi**. For the demo data, that is the farmer `+255777000001` (farms FARM001 and FARM002). Dial your USSD code, or send SMS to your short code. Outgoing SMS to that number appear in the simulator.

> In the sandbox, SMS are only "delivered" to the web simulator, never to real phones. Going live needs a
> production AT application: set `AT_USERNAME` to its username, `AT_ENVIRONMENT=production`, and use an
> approved sender ID and a USSD code for the Tanzanian networks. **Demo accounts never receive SMS from a
> production AT account.**

## 4. The USSD menu

The menu follows the user's saved language (default Kiswahili). Unknown numbers get
`END Simu hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza.`

```
CON MwaniMlinzi
1. Hatari ya Shamba      → (choose a farm if you have several) → END risk in words + main reason + approved action
2. Ripoti Dalili         → 1 Mwani kuwa mweupe · 2 Kukatika · 3 Ukuaji hafifu · 4 Nyingine
                           → report saved (channel USSD), risk engine re-run, END new risk + action, SMS confirmation
3. Mavuno                → 1 Rekodi mavuno → kg (validated, 3 tries) → confirm 1/2 → saved (channel USSD) + SMS confirmation
                           2 Makadirio ya mavuno → expected kg and date
4. Ushauri               → END the approved next action (or "Data haitoshi kutoa ushauri wa kuaminika.")
5. Lugha                 → 1 Kiswahili · 2 English → saved to the user's profile, menu shown again in the new language
0 = back to the main menu (from any submenu)
```

- **State** (menu, farm, language, temporary input such as kg) is stored in `ussd_sessions` with the session ID, phone number, service code, network code, request count and timestamps.
- **Retries:** if AT re-sends the same `sessionId` + `text`, the stored reply is returned and nothing is recorded twice.
- **Expiry:** a session idle for more than 5 minutes answers `END Muda wa kipindi umekwisha…`. The `expire-ussd-sessions` job marks old sessions `EXPIRED`.
- Replies are kept to one USSD screen (≤ 182 characters). Advice always comes from the Action Library, never from the LLM.

## 5. Incoming SMS commands

Commands work in English or Kiswahili, in any case. The farm code is optional when the farmer has one farm.
The reply is a real SMS in the sender's language.

| Command | Result |
|---|---|
| `HATARI` / `RISK [FARM001]` | Current risk in words + approved action |
| `USHAURI` / `ACTION [FARM001]` | Approved next action |
| `RIPOTI` / `REPORT [FARM001] WEUPE/KUKATIKA/HAFIFU/UCHAFU/NZURI/MBAYA [30%]` | Observation recorded (channel SMS), risk re-run |
| `MAVUNO` / `HARVEST [FARM001] 120` | Harvest of 120 kg dry recorded (channel SMS) |
| `MSAADA` / `HELP` | Help text |

Duplicate incoming messages (same AT message `id`) are processed once.

## 6. When MwaniMlinzi sends SMS

SMS are sent only after real events, and only if the user allows them (Settings → SMS alerts):

| Event | SMS type | Needs |
|---|---|---|
| Risk becomes HIGH/CRITICAL (or rises to it) | `RISK_ALERT` | `smsEnabled` + `notifyRiskAlerts`; MEDIUM/LOW never trigger SMS |
| Crop reaches harvest stage (once per planting cycle) | `HARVEST_REMINDER` | `smsEnabled` + `notifyHarvest` |
| Report or harvest received by USSD | `OBSERVATION_CONFIRMATION` / `HARVEST_CONFIRMATION` | `smsEnabled` |
| Reply to an incoming SMS | `SMS_REPLY` | — |
| Admin "Test SMS" | `ADMIN_TEST` | — |

The admin switch `notifications.smsEnabled` turns all automatic SMS off. Seeding and simulations never send SMS.
Every attempt is stored in `notification_logs` with recipient, type, language, message, provider, AT message ID,
cost, status (`QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `UNKNOWN`, `NOT_CONFIGURED`), failure reason, `sent_at` and
`delivered_at`. Delivery reports update the status and never downgrade a final status. Every callback is logged in
`integration_events` (`OK`, `DUPLICATE`, `REJECTED`, `ERROR`) with masked phone numbers and no secrets.

## 7. Test plan

Automated tests (no AT account needed; a fake client replaces the network):
`cd backend && npm test`. Coverage includes `tests/unit/africastalking.test.js`, `tests/integration/channels.test.js`,
`tests/integration/auth.test.js` and `tests/integration/flow.test.js`.

| # | Test | How | Expected |
|---|---|---|---|
| 1 | Not configured | No `AT_*` values, Admin → Test SMS | "Not sent: Africa's Talking is not configured", log status `NOT_CONFIGURED` |
| 2 | Wrong key | `AT_USERNAME=sandbox`, wrong `AT_API_KEY`, Test SMS | `FAILED`: "Authentication failed …" (HTTP 401 from AT) |
| 3 | Sandbox SMS | Correct sandbox key, Test SMS to the simulator phone | `QUEUED`/`SENT`; message appears in the AT simulator; delivery report later sets `DELIVERED` |
| 4 | USSD main menu | Dial the code from `+255777000001` | Kiswahili main menu with 5 options |
| 5 | Unknown number | Dial from an unregistered number | "Simu hii haijasajiliwa MwaniMlinzi…" |
| 6 | Risk | `1` → `1` | Risk words (Hatari ndogo/ya kati/kubwa/kubwa sana), reason and action |
| 7 | Symptom report | `2` → farm → `1` | Report saved (web app shows a USSD observation), risk re-run, SMS confirmation |
| 8 | Harvest | `3` → farm → `1` → `abc` → `120` → `1` | Error for `abc`; then "Mavuno ya kg 120 yamerekodiwa"; harvest has channel USSD |
| 9 | Language | `5` → `2` | English menu; profile language is now English (web app follows after the next login) |
| 10 | Bad secret | Call the callback URL without `?secret=` | HTTP 403 `END Access denied.`; `integration_events` status `REJECTED` |
| 11 | Incoming SMS | Send `HATARI` to the short code | Reply SMS with risk and action |
| 12 | Opt-out | Settings → turn off "Send me SMS", then trigger a HIGH risk | In-app alert only; SMS log shows `SKIPPED` |

## 8. Troubleshooting

- **Admin panel shows `ERROR`:** the last send failed with an authentication or network error. Check `AT_USERNAME`, `AT_API_KEY` and `AT_ENVIRONMENT`: a sandbox key only works with `sandbox`.
- **USSD shows "Access denied":** the `?secret=` in the AT callback URL does not match `AT_CALLBACK_SECRET`.
- **USSD shows "Unknown service":** `AT_USSD_SERVICE_CODE` differs from the code AT sends. Fix the variable or leave it empty.
- **Nothing arrives at the API:** AT cannot reach `PUBLIC_API_URL`. It must be public HTTPS, and a tunnel URL changes each time the tunnel restarts.
- The API logs show `?secret=[REDACTED]`, never the secret itself.
