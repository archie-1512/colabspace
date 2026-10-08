# Leadership sync — 2 October 2026

Attendees: Founder, Maya Chen, Ravi Kumar

## Decisions
- **Hosting:** we are staying on Railway instead of moving to Render. Reason: our real-time trip chat uses WebSockets, Railway keeps a persistent process, and it came out about 30% cheaper at our usage.
- **Database:** Neon Postgres stays. We enable connection pooling for the app but run migrations on the direct connection.
- **Payments fallback:** if Razorpay live keys are not approved by 27 October, launch with "Pay at pickup" only.
- **Onboarding:** cut from 5 screens to 3. Email verification moves to the first booking instead of signup.

## Open questions
- Do we need a separate privacy policy for the Play Store data safety form? Maya to check with the lawyer (Adv. Priya Menon).
- Should the second backend hire be full-time or a 6-month contract? Decide after the seed round closes.

## Action items
- Ravi: chase Razorpay support daily until KYC is approved.
- Maya: get the privacy policy reviewed and published (blocks the App Store submission).
- Founder: reply to Kestrel Ventures on the term sheet by 20 October.
