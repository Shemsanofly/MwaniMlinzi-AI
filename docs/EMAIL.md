# Email password recovery

Forgot password uses the email address saved on the account. It sends a six-digit
code by email, never SMS. Codes expire after 15 minutes, are single use, and are
locked after five incorrect attempts. Sending a new code invalidates the older
one. Up to three codes can be requested per account in 15 minutes.

Accounts registered without email must add an email in their profile while logged
in, or contact an administrator for help recovering access. Phone login and farm
SMS alerts remain available.

## Configure a sender

Set these in the git-ignored `backend/.env`, using the settings supplied by your
email provider. Do not put the password in frontend configuration or commit it.

```dotenv
SMTP_HOST=your-provider-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=MwaniMlinzi <your-verified-sender@example.org>
```

For port 465, use `SMTP_SECURE=true`. Keep `SMTP_REQUIRE_TLS=true` for live mail.
Use a sender address the provider permits. Authenticated providers require both
`SMTP_USER` and `SMTP_PASSWORD`; a private relay can omit both if
it permits sending from this server. See the [Nodemailer SMTP documentation](https://nodemailer.com/smtp).

Restart the API after editing `.env`. With the local always-on runner, run
`npm run stop:local` then `npm run start:local` from the project root. Check
`/api/health`: `providers.email` should be `smtp-email`. This reports configuration,
not inbox delivery. Request a reset for a real registered address and check the
inbox and spam folder. Only receipt of that email verifies external delivery.

Run `npm run email:verify` from `backend` to check SMTP connection and authentication
without sending a message. A missing sender reports exactly which settings are
required. Demo account addresses ending in `.local` cannot receive real email.

Missing settings return `EMAIL_NOT_CONFIGURED`; failed SMTP submission returns
`EMAIL_SEND_FAILED`. The form does not claim a code was sent after these failures.
Unknown/disabled accounts receive the same success response without an email to
avoid disclosing which email addresses have accounts. Delivery logs identify
channel `EMAIL` and type `PASSWORD_RESET`, with the code masked as `******`.

## Automated verification

```powershell
cd backend
npm test -- --runTestsByPath tests/integration/passwordReset.test.js tests/unit/emailProvider.test.js
```

Tests use the isolated test database and fake email/SMS providers. The SMTP test
uses a temporary loopback server, so no real email is sent.
