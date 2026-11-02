# ScopeLedger

ScopeLedger is a working prototype for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). It compares a software client's new request with the agreed statement of work, prepares an editable change order, records client approval, and sends a PayPal sandbox invoice. It is deliberately a **single-merchant sandbox prototype**, not an escrow or payout service.

The dated build and startup plan is in [ROADMAP.md](ROADMAP.md).

## What works

- Create a project with client, agreed scope, hourly rate, and currency.
- Enter a request or import a public GitHub issue.
- Run an AI comparison with exact, server-validated quotes from both inputs. The model may return `in_scope`, `extra_work`, or `uncertain`.
- Edit hours and deliverable; price is calculated from the saved project rate.
- Give the client a private review link. Their name and acceptance time are recorded.
- Create and send a PayPal **sandbox** invoice only after acceptance, then reconcile its status. Verified webhooks and manual status refresh both support payment tracking.

The sample project and sample comparison are for local UI testing. A sample comparison is explicitly labeled and **does not use AI**. A real hackathon demonstration needs `OPENAI_API_KEY` and PayPal sandbox credentials.

## Requirements

- Node.js 22.13 or newer (Node's built-in SQLite module is used)
- npm
- An OpenAI API key for AI comparison
- PayPal Developer sandbox app with a business account that has Invoicing enabled, plus a sandbox buyer account

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, replace the copy command with `Copy-Item .env.example .env`. Open `http://localhost:4173`.

The app loads `.env` automatically. Fill these values to test the real integration:

```dotenv
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_INVOICER_EMAIL=your_sandbox_business_account_email
PAYPAL_BUYER_EMAIL=your_sandbox_personal_account_email
PAYPAL_WEBHOOK_ID=your_registered_sandbox_webhook_id
```

Set `PAYPAL_INVOICER_EMAIL` to the email of the **sandbox business account associated with the REST app**. Set `PAYPAL_BUYER_EMAIL` before loading the sample project so the sample client is your sandbox buyer. For a custom project, set the client email to that buyer account. Credentials stay server-side; do not commit `.env`.

For webhooks, expose the app over HTTPS and register `https://YOUR_HOST/api/webhooks/paypal` on the **same sandbox REST app**. Subscribe to `INVOICING.INVOICE.PAID` and other invoice events you want to track. Manual **Refresh status** works even when your local app cannot receive a webhook.

## Demo flow

1. Set `PAYPAL_BUYER_EMAIL`, then click **Load sample project**, or create a project using the sandbox buyer email. An existing sample project keeps its original email; create a new project if you loaded it before configuring the buyer.
2. Select the sample request and click **Analyze request**. If there is no AI key, this button reads **Run local sample** and gives no AI verdict.
3. Edit the additional deliverable and estimated hours; save.
4. Create the client review link and open it in another browser tab.
5. Accept as the client, then return to the admin app and refresh the page.
6. Send the PayPal invoice and pay it with a sandbox buyer account.
7. Click **Refresh status** or receive a verified PayPal webhook to show payment.

## Build and test

```bash
npm run build
npm test
```

The tests verify the local approval flow, AI citation validation, and payment-status rules. They cannot prove a live AI or PayPal sandbox call without those credentials.

## Deployment notes

`npm run build` creates `dist/`; `npm start` serves the built app. Set `NODE_ENV=production`, `ADMIN_TOKEN`, and the provider variables in your host. **Persist `DATABASE_PATH` on a durable volume.** The local SQLite store is appropriate for one demo instance; a multi-instance product needs a shared database and proper user authentication. The client review link is a bearer link; use a strong, private URL and only fictional client data in a public demo.

The production server refuses to start without `ADMIN_TOKEN`. Give judges the token in private testing instructions if using a hosted demo. Do not publish it in the repository. `DEMO_MODE=true` only enables the sample project and sample comparison; it never fakes a PayPal payment.

## How AI and PayPal are used

- **AI:** OpenAI Responses API with a JSON schema. It compares the scope and request, quotes supporting passages, classifies conservatively, and suggests a draft deliverable and hours. Server-side validation rejects invented quotes. A human sets the final terms.
- **PayPal:** OAuth client credentials for a sandbox REST app; Invoicing v2 to create, send, and retrieve the invoice; webhook signature verification and invoice retrieval before a paid status is displayed. PayPal remains the hosted payment page.

## Hackathon submission checklist

- Public repository with this `LICENSE` file visible to the code host.
- Real AI and PayPal sandbox flow verified with your own credentials.
- Working hosted demo or complete setup and test-account instructions.
- Public YouTube demo under three minutes, showing the product functioning.
- Use [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) for the Devpost description and video script after real provider calls are verified.
- Devpost description that identifies the target user, problem, AI tool, PayPal APIs, and limits.

The hackathon closes **November 12, 2026 at 12:00 p.m. PST**. The repository and video need to be publicly accessible by then.

## Security and product limits

This prototype has one admin token rather than user accounts. It does not give legal advice, validate a contract, sign a formal agreement, or move money outside PayPal's sandbox. AI classifications and estimates require human review. Do not use real client documents or credentials in a public demo.
