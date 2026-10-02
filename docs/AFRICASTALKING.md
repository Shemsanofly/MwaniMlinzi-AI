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
| `AT_SMS_DEV_CAPTURE` | `false` | Sandbox dev only. `true` → outbound SMS is captured to `event_logs` (DELIVERY) (visible in Admin → Africa's Talking) instead of being sent to AT. Use it to develop or demo USSD→SMS flows when AT auth is not yet working. Silently ignored in production. |

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
8. **Phone simulator:** open AT's sandbox simulator (linked from the sandbox dashboard) and start a phone with your own sandbox test number (a Tanzanian `+255…` number you choose). **Register a farmer with that number first** — on the web at `/register` (then add a farm), or by dialling the USSD code from the simulator and following the registration menu. Then dial your USSD code, or send SMS to your short code. Outgoing SMS to that number appear in the simulator.

> In the sandbox, SMS are only "delivered" to the web simulator, never to real phones. Going live needs a
> production AT application: set `AT_USERNAME` to its username, `AT_ENVIRONMENT=production`, and use an
> approved sender ID and a USSD code for the Tanzanian networks.

## 4. The USSD menu

USSD runs only on a phone, through Africa's Talking. The web app has no USSD page or simulator.

A registered number gets the menu in the user's saved language (default Kiswahili). An **unknown number** can
register itself: it chooses a language (`CON MWANIMLINZI
1. Kiswahili
2. English`), then **gives consent**
(`Taarifa za shamba lako zitatumika kukupa ushauri na kuboresha huduma. 1. Nakubali 2. Sikubali` — choosing 2 ends the
session and stores nothing), enters a full name, picks a location (Paje, Jambiani, Kiwani or another place name), a species
and the number of lines. This creates a FARMER account for that phone number and one farm (planting date = today), then shows
the main menu. A typed "other" place gets no map point until an admin sets it, so no other site's weather is used for it. The
account has a random password; the farmer can set one on the web with *Forgot your password?* (a code is sent by SMS). No other
farm or personal data is shown to an unknown number.

The main menu follows the pitch deck (slide 8):

```
CON MWANIMLINZI
1. Hali ya shamba   → 1 Hatari na hatua · 2 Maji kupwa na kukausha · 3 Faida ya msimu
                      (choose a farm if you have several)
                      1 → END e.g.  FARM001
                                    Hatari: KUBWA (joto/ice-ice)
                                    Kwa nini: Maji ya bahari yana joto kuliko kawaida.
                                    Hatua: Kagua mistari ya mwani ndani ya saa 24 …
                      2 → END e.g.  FARM002
                                    Maji kupwa: leo 12:00 (muda wa kazi 10:00-13:00)
                                    Kukausha leo: NZURI
                                    Siku nzuri ya kukausha. Anika mwani kwenye vichanja … si ardhini.
                          (from the stored Open-Meteo forecast; "Hakuna utabiri wa bahari…" when there is none)
                      3 → END e.g.  FARM002 msimu huu / Mapato: TSh 120,000 / Gharama: TSh 50,000 / Faida: TSh 70,000
                                    (from the farmer's own record book; "Unadai" shows money not yet paid)
2. Tahadhari        → END the newest unresolved real alerts for your farms (max 3). Falls back to the
                      current risk summary per farm ("FARM002: NDOGO (joto)") when there are no alert
                      rows yet, so the screen is never blank; still "Hakuna tahadhari mpya…" when there
                      is no risk data at all.
3. Ripoti tatizo    → 1 Mwani kuwa mweupe · 2 Kukatika · 3 Ukuaji hafifu · 4 Nyingine
                      → report saved (channel USSD), risk engine re-run, END new risk + action, SMS confirmation
4. Rekodi mavuno    → 1 Mavuno: "Ingiza kiasi cha mavuno kwa kilo" → kg (validated, 3 tries) → confirm 1/2
                        → saved (channel USSD) + SMS confirmation
                      2 Mauzo: kg sold → price per kg (TSh, digits only) → "Thibitisha mauzo ya kg 120 kwa TSh 1,000/kg
                        = TSh 120,000 (FARM002)?" → saved to the record book (no SMS)
                      3 Gharama: 1 Mbegu · 2 Kamba/mistari · 3 Vigingi · 4 Uzi wa kufungia · 5 Vibarua · 6 Usafiri
                        · 7 Vifaa vya kuanikia · 8 Nyingine → amount (TSh) → confirm → saved (no SMS)
                      4 Kazi: 1 Kupanda · 2 Kufunga mbegu · 3 Kusafisha mistari · 4 Kutengeneza mistari · 5 Kuvuna
                        · 6 Kuanika · 7 Nyingine → saved for today
5. Msaada           → 1 Ushauri (the next action from the Action Library) · 2 Lugha (1 Kiswahili · 2 English, saved
                      to the profile) · 3 Kuhusu huduma
0 = back to the main menu (from any submenu)
```

**Drying-weather SMS.** Every morning (06:20) farms that are within 3 days of their expected harvest, or recorded a harvest in
the last 3 days, get one SMS when rain is likely today or tomorrow during drying hours (07:00–18:00), e.g.
`MWANIMLINZI FARM002, kesho 01/10: Mvua inatarajiwa. Ikiwezekana, chelewesha kuvuna; funika mwani…` (always one
160-character SMS segment). At most one per farm per day; warnings about a day that has passed are resolved automatically; it follows the farmer's *harvest reminders* SMS preference. There is no daily broadcast SMS.

**SMS echoes for basic-phone farmers.** USSD screens close in seconds and fit only ~182 characters, and a farmer
without a smartphone cannot re-open them. So every read-only USSD screen also sends an SMS with the same
information, kept on the phone: menu 2 (alerts) sends the alert messages, menu 1→1 (risk) sends the risk level
and action, menu 1→2 (outlook) sends the tide/drying line, and menu 5→1 (advice) sends the recommended action.
USSD registration ends with a welcome SMS carrying the new farm code. All echoes use the `SMS_REPLY` type — like
inbound-SMS command replies, they always send (the farmer explicitly asked by dialling), regardless of the SMS
preference toggles. In the AT sandbox they appear in the phone simulator.

All answers come from the same backend services as the web app (`RiskService`, `RecordService`,
`SMSService`); the USSD handler contains no risk logic of its own. Errors (database down, unexpected
input) end the session with `END Samahani, kuna tatizo. Tafadhali jaribu tena.` and never show technical details.

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

The admin switch `notifications.smsEnabled` turns all automatic SMS off. Seeding and what-if simulations never send SMS.
Every attempt is stored in `event_logs` (DELIVERY) with recipient, type, language, message, provider, AT message ID,
cost, status (`QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `UNKNOWN`, `NOT_CONFIGURED`), failure reason, `sent_at` and
`delivered_at`. Delivery reports update the status and never downgrade a final status. Every callback is logged in
`event_logs` (INTEGRATION) (`OK`, `DUPLICATE`, `REJECTED`, `ERROR`) with masked phone numbers and no secrets.

## 7. Test plan

Automated tests (no AT account needed; a fake client replaces the network):
`cd backend && npm test`. Coverage includes `tests/unit/africastalking.test.js`, `tests/integration/channels.test.js`,
`tests/integration/auth.test.js` and `tests/integration/flow.test.js`.

| # | Test | How | Expected |
|---|---|---|---|
| 1 | Not configured | No `AT_*` values, Admin → Test SMS | "Not sent: Africa's Talking is not configured", log status `NOT_CONFIGURED` |
| 2 | Wrong key | `AT_USERNAME=sandbox`, wrong `AT_API_KEY`, Test SMS | `FAILED`: "Authentication failed …" (HTTP 401 from AT) |
| 3 | Sandbox SMS | Correct sandbox key, Test SMS to the simulator phone | `QUEUED`/`SENT`; message appears in the AT simulator; delivery report later sets `DELIVERED` |
| 4 | USSD main menu | Register a farmer with your sandbox simulator number first, then dial the code from that number | Kiswahili main menu with 5 options |
| 5 | Unknown number | Dial from an unregistered simulator number, choose `1` or `2`, enter a name, location, species and lines | Account and farm created ("Umesajiliwa MwaniMlinzi." / "You are registered with MwaniMlinzi."), then the main menu; the farmer appears in Admin → Users |
| 6 | Risk | `1` → `1` | `Hatari: NDOGO/YA KATI/KUBWA/KUBWA SANA`, reason and action |
| 7 | Symptom report | `2` → farm → `1` | Report saved (web app shows a USSD observation), risk re-run, SMS confirmation |
| 8 | Harvest | `3` → farm → `abc` → `120` → `1` | Error for `abc`; then "Mavuno ya kg 120 yamerekodiwa"; harvest has channel USSD |
| 8b | Session timeout | Start a session, wait more than 5 minutes, answer | "Muda wa kipindi umekwisha. Tafadhali piga tena." |
| 8c | Password reset | Web → Log in → "Forgot your password?" → phone | 6-digit code arrives by SMS (simulator); code + new password → log in. Without `AT_*` the page says SMS is not configured |
| 9 | Language | `5` → `2` | English menu; profile language is now English (web app follows after the next login) |
| 10 | Bad secret | Call the callback URL without `?secret=` | HTTP 403 `END Access denied.`; `event_logs` (INTEGRATION) status `REJECTED` |
| 11 | Incoming SMS | Send `HATARI` to the short code | Reply SMS with risk and action |
| 12 | Opt-out | Settings → turn off "Send me SMS", then trigger a HIGH risk | In-app alert only; SMS log shows `SKIPPED` |
| 13 | USSD echoes to SMS | Dial the code and open menu 2 (Alerts), then 1→1, 1→2, 5→1 in turn | An SMS arrives in the simulator for each screen, with the same information; log entries are `SMS_REPLY` |
| 14 | Welcome SMS on registration | Dial from an unregistered number, finish onboarding | The simulator receives `Karibu MwaniMlinzi. Umesajiliwa. Shamba lako ni FARM…` (or the English variant) |

## 8. Troubleshooting

- **Admin panel shows `ERROR`:** the last send failed with an authentication or network error. Check `AT_USERNAME`, `AT_API_KEY` and `AT_ENVIRONMENT`: a sandbox key only works with `sandbox`.
- **USSD shows "Access denied":** the `?secret=` in the AT callback URL does not match `AT_CALLBACK_SECRET`.
- **USSD shows "Unknown service":** `AT_USSD_SERVICE_CODE` differs from the code AT sends. Fix the variable or leave it empty.
- **Nothing arrives at the API:** AT cannot reach `PUBLIC_API_URL`. It must be public HTTPS, and a tunnel URL changes each time the tunnel restarts.
- The API logs show `?secret=[REDACTED]`, never the secret itself.
