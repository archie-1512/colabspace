import Link from "next/link";

const FEATURES = [
  {
    dot: "bg-indigo",
    title: "Workspaces & boards",
    body: "Organise work into workspaces, each with its own Kanban boards and configurable access controls.",
  },
  {
    dot: "bg-amber",
    title: "Real-time collaboration",
    body: "See who is online, watch cards update instantly across all open sessions, and know when someone is editing a card you're looking at.",
  },
  {
    dot: "bg-moss",
    title: "Role-based access",
    body: "Owners, admins, and members each have different levels of authority. Invites go out by email or shareable link — no one joins without accepting.",
  },
  {
    dot: "bg-coral",
    title: "Rich cards",
    body: "Each card can carry a description, due date, file attachments, shared links, and assigned members — enable only what the task needs.",
  },
  {
    dot: "bg-grey",
    title: "Direct messaging",
    body: "Message any workspace member directly. Click their avatar anywhere in the app to start a conversation.",
  },
  {
    dot: "bg-indigo",
    title: "Semantic search (coming soon)",
    body: "Ask questions across all your cards and documents in natural language — powered by retrieval-augmented generation.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="max-w-6xl mx-auto px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo" />
          <span className="font-display font-semibold tracking-tight">CollabSpace</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/login" className="text-sm font-medium text-muted hover:text-ink">
            Log in
          </Link>
          <Link href="/signup" className="text-sm font-medium bg-indigo text-white rounded-md px-4 py-2">
            Get started
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-8 pt-20 pb-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-display font-semibold leading-tight tracking-tight">
          Your team's workspace,
          <br />
          built for how you actually work.
        </h1>
        <p className="text-muted mt-5 text-base max-w-lg mx-auto leading-relaxed">
          Boards, cards, file sharing, direct messaging, and live collaboration — all in one place. 
          Configurable access controls mean every workspace works the way your team does.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link href="/signup" className="bg-indigo text-white rounded-md px-6 py-3 text-sm font-medium">
            Create a free workspace
          </Link>
          <Link href="/login" className="border border-line rounded-md px-6 py-3 text-sm font-medium bg-white">
            Log in
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-8 pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-line rounded-lg shadow-card p-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-2 h-2 rounded-full ${f.dot}`} />
                <h3 className="font-display font-semibold text-sm">{f.title}</h3>
              </div>
              <p className="text-sm text-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line max-w-6xl mx-auto px-8 py-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo" />
          <span className="font-display font-medium text-sm tracking-tight">CollabSpace</span>
        </div>
        <p className="text-xs text-muted font-mono">Portfolio project · Not a commercial product</p>
      </footer>
    </main>
  );
}
