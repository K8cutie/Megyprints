# Payment QR (GoTyme InstaPay)

Checkout takes payment by bank transfer: the customer scans the owner's
GoTyme InstaPay / QR Ph code from any PH bank or e-wallet app, then attaches
the receipt in the app. The operator matches the deposit in the GoTyme app and
taps **Mark paid** in `/admin`.

## Where the QR image lives

`public/pay/gotyme-instapay.png` — the screenshot from the GoTyme app
("Receive money" → QR). The Order page shows it at `/pay/gotyme-instapay.png`.
Committed 2026-09-10 (418×561 px). It decodes as a QR Ph / EMVCo payload
addressed to GoTyme (`com.p2pqrpay`, `GOTYPHM2XXX`), so it scans from any
InstaPay app. Replace the file if the account ever changes.

The payee text (bank, name, last four digits) is in `src/lib/payment.ts`.
Change both together when the account changes.

## Limits that matter (GoTyme, checked 2026-09-10)

- No cap on the **number** of transfers in or out.
- Sender side via InstaPay: up to ₱50,000 per transaction, ₱500,000 per day.
  That is the sender's limit, set by their own bank/e-wallet.
- GoTyme does not charge to **receive** InstaPay; the sender's app may charge.
- Incoming daily caps "may apply depending on account level" — check the
  GoTyme app for the account's own figure. Album totals are far below any of
  these.

## Operator flow

1. Customer places the order (print PDF uploads) → sees the QR + amount +
   order number → transfers → attaches receipt + reference → "I've sent it".
2. `/admin` → Orders: the row shows **Customer says paid**, the reference,
   and a **Receipt** button (signed URL, operators only).
3. Match the deposit in the GoTyme app → **Mark paid** → print.
