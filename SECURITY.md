# Security policy

## Reporting a vulnerability

Email **security@homegentic.app**, or use GitHub's private vulnerability
reporting (the **Report a vulnerability** button on this repository's Security
tab). Please don't open a public issue.

Include what you found, how to reproduce it, and what an attacker could do
with it. We will:

- confirm we received it within 3 business days,
- tell you within 10 business days whether we accept it and how we plan to fix it,
- let you know when the fix is deployed, and credit you if you want.

Please give us 90 days, or until a fix is deployed if sooner, before you
publish details. Testing that stays within your own accounts and data is
welcome. Don't access other people's data, degrade the service (including
by draining canister cycles or paid API budgets), or use social engineering.

## Scope

- The web app and its canisters on the Internet Computer
- The voice Worker, email Worker, notification relay and IoT gateway
- The iOS and Android apps

Third-party services we use (Stripe, Internet Identity, Cloudflare, Fly.io,
Resend, Twilio, Anthropic) have their own programmes.

## How we handle incidents

`docs/INCIDENT_RUNBOOK.md` covers containment, rollback, restores and
notifying affected users. `docs/SECURITY.md` describes the security
controls in the code.
