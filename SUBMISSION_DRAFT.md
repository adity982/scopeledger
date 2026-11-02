# PayPal AI Hackathon submission draft

**Status:** Draft. Do not submit the claims in the final section until you have personally verified a real AI comparison and PayPal sandbox payment. Replace all bracketed links.

## Title

ScopeLedger — turn scope changes into clear, paid work

## One-line pitch

ScopeLedger helps small software agencies compare a new client request to the agreed project scope, approve a change order, and collect the additional fee through PayPal.

## Description

Fixed-price projects often change through an issue or a casual message. The hard part is explaining whether the new request was included in the original agreement, then getting a clear decision before extra work begins. ScopeLedger keeps the agreed scope beside each new request and makes the evidence visible to both sides.

The freelancer adds a statement of work and a client request, or imports a public GitHub issue. An AI model classifies the request as in scope, extra work, or uncertain and quotes exact passages from the scope and request. The server checks that the quotations really appear in the source text. The freelancer then edits the deliverable and hours. ScopeLedger calculates the fee from the project rate and creates a private client review page. After the client accepts, the app creates and sends a PayPal sandbox invoice. The app retrieves the invoice status and can process verified PayPal webhooks; it only presents a fully `PAID` invoice as paid.

The prototype is aimed at freelance developers and small agencies that sell fixed-price software work. Its specific focus is the evidence between a software project's agreed scope, a new issue, a human-approved price, and PayPal payment. It is not a contract-signing service or an autonomous pricing agent.

## How the tools are used

- **OpenAI Responses API:** structured scope comparison, conservative classification, quoted evidence, and an editable suggested deliverable and hours.
- **PayPal sandbox Invoicing v2:** OAuth authentication, invoice creation, sending, and status retrieval.
- **PayPal webhooks:** signature verification, deduplication, and invoice-state reconciliation.
- **GitHub API:** optional import of a public issue as the client request.

## What I built

- A responsive seller workspace for project scopes, requests, evidence, and change orders.
- A private client review page with named, time-stamped acceptance.
- A PayPal sandbox invoice flow after acceptance, with a hosted PayPal payment page.
- Tests for the local approval flow, exact AI citations, invoice-status interpretation, and PayPal API request construction.

## Links to fill in

- Repository: https://github.com/adity982/scopeledger
- Hosted demo or complete setup and testing instructions: [link]
- Public YouTube video under three minutes: [link]

## Video script, maximum 2:50

1. **0:00–0:20:** “A fixed-price checkout project has an agreed scope. The client now asks for native mobile screens and SMS updates.” Show both texts.
2. **0:20–0:55:** Run the **real AI comparison**. Show the exact scope and request quotes, the verdict, and the uncertainty option. Say that the freelancer makes the final call.
3. **0:55–1:25:** Edit the deliverable and hours; show the computed fee. Create the client review link.
4. **1:25–1:55:** Open the client page and accept the change. Return to the seller workspace and refresh.
5. **1:55–2:35:** Create the **real PayPal sandbox invoice**. Open the hosted invoice, pay as the sandbox buyer, and refresh until the app shows `PAID`.
6. **2:35–2:50:** State the target user and what you would validate next with agencies.

Edit out waiting time. Keep the actual interaction and result on screen. Do not represent the local sample analysis as an AI call, or a mocked invoice as a PayPal transaction.

## Final verification before Devpost submission

- [ ] `OPENAI_API_KEY` runs a real, source-cited comparison.
- [ ] The PayPal sandbox business app creates and sends a real invoice to a sandbox buyer.
- [ ] A real sandbox buyer payment changes the invoice to `PAID` in the app.
- [ ] Judge access works from a fresh browser with the provided instructions.
- [ ] The public repository shows the MIT license and contains no secrets.
- [ ] The YouTube video is public, under three minutes, and matches the working build.
- [ ] The Devpost entry includes the repository, demo access, tool disclosure, and video.

The official deadline is **November 12, 2026 at 12:00 p.m. PST / November 13 at 1:30 a.m. IST**. Aim to submit a day earlier.
