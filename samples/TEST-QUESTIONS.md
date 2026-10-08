# Testing "Ask workspace" with the demo data

Seed it first (your own account becomes the owner):

    npm run seed:demo -- --owner you@example.com

Open the **Nimbus Labs (demo)** workspace and click **Ask workspace**.
Teammates all use the password `demo1234`:
maya@collabspace.demo (admin), ravi@ / sara@ / dev@collabspace.demo (members).

## 1. Structured questions (answered from the live overview)
| Ask | Expected |
|---|---|
| Is anything overdue? | Privacy policy (4 days), Android 12 map crash (2 days), Load test search API (1 day) |
| What's due this week? | Instagram teaser (2 days), Razorpay (3), Launch blog post (5), Push reminders (6) |
| What is Dev working on? | Push reminders, load test, Android crash (with Ravi) |
| How many boards are there? | Owner/Maya: 3. Ravi/Sara/Dev: 2 (they can't see Leadership) |
| What's assigned to me? | Owner: Privacy policy, Seed round, Hiring |

## 2. Content questions (answered by vector search, with citations)
| Ask | Expected source |
|---|---|
| What's blocking the payment integration? | Razorpay card: KYC not approved, no live keys |
| What happens if payments aren't ready in time? | Razorpay card / launch-plan.md: launch with Pay at pickup |
| Why did we pick Railway over Render? | meeting-notes-2-oct.md (owner/Maya only): WebSockets + ~30% cheaper |
| What's the success metric for launch? | TripTrail-PRD.pdf: 1,000 bookings in 30 days |
| Which phones crash on the map screen? | Android crash card / beta-feedback.csv: Samsung M31, Redmi Note 10 |
| What's our marketing budget? | launch-plan.md: Rs 1,20,000 split three ways |
| How many Google Maps requests did we use in September? | api-rate-limits.txt: 71,400 of 100,000 |
| What's blocking the App Store submission? | Privacy policy not published yet |

## 3. Permission checks (the important ones)
| Log in as | Ask | Expected |
|---|---|---|
| Owner or Maya | What are the terms of the Kestrel term sheet? | Rs 2.5 crore at Rs 18 crore pre-money |
| Ravi | Same question | Not found: the Leadership board is hidden from members |
| Ravi | What did Razorpay support say about KYC? | His own DM with the owner: GST address mismatch |
| Sara | Same question | Not found: that DM isn't hers |
| Owner | Why don't iOS reminders work? | Push reminders card: needs the APNs key. Not the Sara–Dev DM, since the owner isn't in it |

## 4. Live updates
1. As the owner, drag "Fix crash on Android 12…" to Done, then ask "Is anything overdue?" It should no longer be listed.
2. Make the "Instagram teaser campaign" card visible to assigned people only, then ask as Ravi about the Instagram budget. It should disappear for him straight away.
3. Upload `api-rate-limits.txt` (or any PDF) to a card, wait a few seconds, and ask about something inside it.
