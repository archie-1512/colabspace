// Seeds a realistic demo workspace ("Nimbus Labs") for testing Ask workspace.
//
//   npm run seed:demo -- --owner you@example.com   ← your existing account becomes the owner
//   npm run seed:demo                              ← creates "Alex Founder" (alex@collabspace.demo) as owner
//   npm run seed:demo -- --reset ...               ← deletes the previous demo workspace first
//
// Demo teammates all use the password  demo1234  so you can log in as them and
// check what each role can and can't see. Due dates are relative to today, so
// "overdue" and "due this week" questions always have answers.
import { readFile } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generateStoredName, saveFile, deleteStoredFile } from "../lib/storage";
import { indexEverything } from "../lib/rag/indexers";

const WORKSPACE_NAME = "Nimbus Labs (demo)";
const PASSWORD = "demo1234";
const SAMPLES = path.join(process.cwd(), "samples");

const args = process.argv.slice(2);
const ownerEmail = args.includes("--owner") ? args[args.indexOf("--owner") + 1]?.toLowerCase() : undefined;
const reset = args.includes("--reset");

const day = (n: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const TEAM = [
  { key: "maya", name: "Maya Chen", email: "maya@collabspace.demo", role: "ADMIN" },
  { key: "ravi", name: "Ravi Kumar", email: "ravi@collabspace.demo", role: "MEMBER" },
  { key: "sara", name: "Sara Ali", email: "sara@collabspace.demo", role: "MEMBER" },
  { key: "dev", name: "Dev Patel", email: "dev@collabspace.demo", role: "MEMBER" },
] as const;

async function removeExisting() {
  const old = await prisma.workspace.findMany({ where: { name: WORKSPACE_NAME }, select: { id: true } });
  for (const { id } of old) {
    const cards = await prisma.card.findMany({ where: { board: { workspaceId: id } }, select: { id: true } });
    const cardIds = cards.map((c) => c.id);
    const files = await prisma.cardFile.findMany({ where: { cardId: { in: cardIds } } });
    for (const f of files) await deleteStoredFile(f.storedName);
    await prisma.$executeRaw`DELETE FROM "Embedding" WHERE "workspaceId" = ${id}`;
    await prisma.cardFile.deleteMany({ where: { cardId: { in: cardIds } } });
    await prisma.cardLink.deleteMany({ where: { cardId: { in: cardIds } } });
    await prisma.cardAssignee.deleteMany({ where: { cardId: { in: cardIds } } });
    await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
    await prisma.board.deleteMany({ where: { workspaceId: id } });
    await prisma.invite.deleteMany({ where: { workspaceId: id } });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: id } });
    await prisma.workspace.delete({ where: { id } });
  }
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: "@collabspace.demo" } }, select: { id: true } });
  const ids = demoUsers.map((u) => u.id);
  await prisma.message.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
  await prisma.$executeRaw`DELETE FROM "Embedding" WHERE "sourceType" = 'dm'`; // rebuilt below
  return old.length;
}

async function main() {
  const existing = await prisma.workspace.count({ where: { name: WORKSPACE_NAME } });
  if (existing && !reset) {
    console.log(`"${WORKSPACE_NAME}" already exists. Run again with --reset to recreate it.`);
    return;
  }
  if (reset) console.log(`Removed ${await removeExisting()} old demo workspace(s).`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const upsertUser = (name: string, email: string) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { name, email, passwordHash } });

  // --- People ---
  let owner;
  if (ownerEmail) {
    owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!owner) throw new Error(`No account with email ${ownerEmail}. Sign up in the app first, or leave out --owner.`);
  } else {
    owner = await upsertUser("Alex Founder", "alex@collabspace.demo");
  }
  const u: Record<string, { id: string; name: string }> = { owner };
  for (const t of TEAM) u[t.key] = await upsertUser(t.name, t.email);

  // --- Workspace ---
  const ws = await prisma.workspace.create({
    data: {
      name: WORKSPACE_NAME,
      description: "TripTrail: a group trip planner. Launching v1.0 at the end of October.",
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          ...TEAM.map((t) => ({ userId: u[t.key].id, role: t.role })),
        ],
      },
    },
  });

  // --- Helpers ---
  let position = 0;
  async function card(
    boardId: string,
    c: {
      title: string;
      content: string;
      status?: "TODO" | "IN_PROGRESS" | "DONE";
      due?: number;
      assign?: string[];
      visibility?: "ALL_MEMBERS" | "ASSIGNED_ONLY";
      links?: { label: string; url: string; by: string }[];
      files?: { name: string; mime: string; by: string }[];
    }
  ) {
    const created = await prisma.card.create({
      data: {
        boardId,
        title: c.title,
        content: c.content,
        status: c.status ?? "TODO",
        position: position++,
        trackDueDate: c.due !== undefined,
        dueDate: c.due !== undefined ? day(c.due) : null,
        visibility: c.visibility ?? "ALL_MEMBERS",
        enableLinks: !!c.links?.length,
        enableFiles: !!c.files?.length,
        assignees: { create: (c.assign ?? []).map((k) => ({ userId: u[k].id })) },
        links: { create: (c.links ?? []).map((l) => ({ label: l.label, url: l.url, addedById: u[l.by].id })) },
      },
    });
    for (const f of c.files ?? []) {
      const buf = await readFile(path.join(SAMPLES, f.name));
      const storedName = generateStoredName(f.name);
      await saveFile(storedName, buf, f.mime);
      await prisma.cardFile.create({
        data: { cardId: created.id, uploadedById: u[f.by].id, filename: f.name, storedName, mimeType: f.mime, size: buf.length },
      });
    }
    return created;
  }

  // --- Board 1: Product Launch (everyone) ---
  const launch = await prisma.board.create({
    data: { workspaceId: ws.id, title: "Product Launch v1.0", description: "Everything that has to ship before the public launch." },
  });
  await card(launch.id, {
    title: "Razorpay payment integration",
    status: "IN_PROGRESS",
    due: 3,
    assign: ["ravi"],
    content:
      "Cards and UPI work in test mode. BLOCKED on going live: Razorpay hasn't approved our KYC yet, so we don't have live API keys. Their support said 3 to 5 business days on 1 October. Fallback agreed: launch with Pay at pickup only if live keys aren't approved by 27 October.",
    links: [{ label: "Razorpay go-live checklist", url: "https://razorpay.com/docs/payments/payment-gateway/", by: "ravi" }],
  });
  await card(launch.id, {
    title: "Fix crash on Android 12 when opening the map",
    status: "IN_PROGRESS",
    due: -2,
    assign: ["ravi", "dev"],
    content:
      "Crash when tapping View on map from a trip card, only on Android 12 (Samsung M31, Redmi Note 10). Stack trace points at the Google Maps SDK being initialised before location permission is granted. Three beta testers hit it. This blocks the crash-free sessions launch criterion.",
  });
  await card(launch.id, {
    title: "Privacy policy and terms of service",
    status: "TODO",
    due: -4,
    assign: ["maya", "owner"],
    content:
      "Waiting on review from our lawyer, Adv. Priya Menon. Must mention that location is only collected during an active trip. This BLOCKS the App Store submission: Apple rejects apps without a privacy policy link.",
  });
  await card(launch.id, {
    title: "App Store submission (iOS)",
    status: "TODO",
    due: 10,
    assign: ["sara"],
    content:
      "Build 1.0.0 (42) is ready in TestFlight. Can't submit until the privacy policy is published. Review usually takes 1 to 3 days. Screenshots done for 6.7 and 5.5 inch.",
  });
  await card(launch.id, {
    title: "Push notification reminders",
    status: "IN_PROGRESS",
    due: 6,
    assign: ["dev"],
    content:
      "Android reminders work through Firebase Cloud Messaging. iOS needs the APNs key uploaded to Firebase, and only the founder's Apple developer account can create it. Waiting on the founder.",
  });
  await card(launch.id, {
    title: "Load test search API",
    status: "TODO",
    due: -1,
    assign: ["dev"],
    content:
      "Last k6 run: /search p95 was 1.8 s at 500 rps, target is under 800 ms. Probably a missing index on trips.city. Re-run after adding the index.",
    files: [{ name: "api-rate-limits.txt", mime: "text/plain", by: "dev" }],
  });
  await card(launch.id, {
    title: "Beta feedback triage",
    status: "DONE",
    assign: ["maya"],
    content: "Went through all 120 beta responses. Top issues: Android 12 map crash, search spelling variants (Kochi vs Cochin), no UPI option, missing trip reminders.",
    files: [{ name: "beta-feedback.csv", mime: "text/csv", by: "maya" }],
  });
  await card(launch.id, {
    title: "Onboarding redesign",
    status: "DONE",
    assign: ["sara"],
    content: "Shipped. Cut onboarding from 5 screens to 3 and moved email verification to the first booking. Beta testers liked it.",
  });
  await card(launch.id, {
    title: "Product requirements (PRD)",
    status: "DONE",
    assign: ["maya"],
    content: "Final PRD for v1.0 is attached. Success metric: 1,000 bookings in the first 30 days.",
    files: [{ name: "TripTrail-PRD.pdf", mime: "application/pdf", by: "maya" }],
  });

  // --- Board 2: Marketing (everyone) ---
  const marketing = await prisma.board.create({
    data: { workspaceId: ws.id, title: "Marketing", description: "Launch campaign." },
  });
  await card(marketing.id, {
    title: "Launch blog post",
    status: "IN_PROGRESS",
    due: 5,
    assign: ["maya"],
    content: "First draft done. Needs screenshots from the final build and a quote from the founder. Publish on launch morning.",
    files: [{ name: "launch-plan.md", mime: "text/markdown", by: "maya" }],
  });
  await card(marketing.id, {
    title: "Instagram teaser campaign",
    status: "TODO",
    due: 2,
    assign: ["sara"],
    content: "Budget Rs 40,000. Five teaser reels over the week before launch: Munnar, Kodaikanal, Gokarna, Varkala, Coorg. Sara is editing the first two.",
  });
  await card(marketing.id, {
    title: "Influencer outreach",
    status: "TODO",
    due: 8,
    assign: ["maya"],
    content: "Shortlisted 3 travel creators (40k to 120k followers). Budget Rs 60,000 total. Two have replied, one is waiting on our brief.",
  });

  // --- Board 3: Leadership (restricted board) ---
  const leadership = await prisma.board.create({
    data: {
      workspaceId: ws.id,
      title: "Leadership",
      description: "Fundraising and hiring. Admins only.",
      visibility: "ASSIGNED_ONLY",
    },
  });
  await card(leadership.id, {
    title: "Seed round: Kestrel Ventures term sheet",
    status: "IN_PROGRESS",
    due: 13,
    assign: ["owner", "maya"],
    visibility: "ASSIGNED_ONLY",
    content:
      "Term sheet from Kestrel Ventures: Rs 2.5 crore at Rs 18 crore pre-money valuation, 1x non-participating liquidation preference, one board seat. Need to reply by 20 October. Maya thinks we can push the valuation to Rs 20 crore.",
    files: [{ name: "meeting-notes-2-oct.md", mime: "text/markdown", by: "maya" }],
  });
  await card(leadership.id, {
    title: "Hire second backend engineer",
    status: "TODO",
    assign: ["owner"],
    content: "Budget Rs 14 to 18 LPA. Full-time vs 6-month contract decision after the seed round closes. Two candidates in the pipeline from referrals.",
  });

  // --- DMs ---
  const dm = (from: string, to: string, content: string, ago: number) =>
    prisma.message.create({ data: { senderId: u[from].id, receiverId: u[to].id, content, createdAt: minutesAgo(ago) } });
  await dm("ravi", "owner", "Razorpay support replied: KYC is stuck because our GST certificate address doesn't match the bank account address.", 300);
  await dm("owner", "ravi", "Ugh. Can we fix it from our side?", 290);
  await dm("ravi", "owner", "Yes, we need to upload an address proof letter on company letterhead. I've drafted it, just need your signature.", 285);
  await dm("owner", "ravi", "Send it over, I'll sign it tonight.", 280);
  await dm("maya", "owner", "Kestrel called again. They want an answer on the term sheet before the 20th. I think we can ask for Rs 20 crore pre-money.", 200);
  await dm("owner", "maya", "Agreed. Let's do a call with them Thursday at 4pm.", 190);
  await dm("sara", "dev", "Dev, the iOS reminders still don't fire on TestFlight. Is that the APNs thing?", 120);
  await dm("dev", "sara", "Yes, we need the APNs key from the founder's Apple account. I've asked twice.", 110);

  console.log(`Created "${WORKSPACE_NAME}" with 3 boards, 14 cards, 5 files and 8 DMs.`);
  console.log("Building the search index (the first run downloads the embedding model)…");
  await indexEverything();
  console.log(`\nOwner: ${ownerEmail ?? "alex@collabspace.demo"}${ownerEmail ? "" : ` / ${PASSWORD}`}`);
  console.log(`Teammates (password ${PASSWORD}): ${TEAM.map((t) => `${t.email} (${t.role.toLowerCase()})`).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
