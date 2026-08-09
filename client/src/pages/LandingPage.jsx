import { Link } from "react-router-dom";
import { HeartHandshake, Building2, ShieldCheck, PhoneCall, ArrowRight, Zap, MapPin, Users } from "lucide-react";
import { Button, Card } from "../components/ui";

const ROLES = [
  {
    title: "Donor",
    desc: "Set your availability & location, and get alerted the moment someone nearby needs your blood type.",
    to: "/login",
    cta: "Donor login",
    icon: HeartHandshake,
    tone: "bg-blood-50 text-blood-600",
  },
  {
    title: "Hospital",
    desc: "Broadcast requests by radius or by city, and track donor responses live as they come in.",
    to: "/login",
    cta: "Hospital login",
    icon: Building2,
    tone: "bg-blue-50 text-blue-600",
  },
  {
    title: "Admin",
    desc: "Oversee requests, transactions, and donor reliability across the whole network.",
    to: "/login",
    cta: "Admin login",
    icon: ShieldCheck,
    tone: "bg-amber-50 text-amber-600",
  },
];

const STATS = [
  { icon: Zap, label: "Real-time alerts", desc: "Donors are notified within seconds of a new request." },
  { icon: MapPin, label: "Distance-ranked", desc: "Nearest eligible donors are matched first, automatically." },
  { icon: Users, label: "No account needed", desc: "Independent recipients can broadcast with just a phone number." },
];

export default function LandingPage() {
  return (
    <div className="py-10 sm:py-16">
      {/* Hero */}
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blood-700 bg-blood-50 px-3 py-1 rounded-full mb-4">
          <Zap size={12} /> Live donor matching
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink-900">
          A faster path between <span className="text-blood-600">donors</span> and the people who need them.
        </h1>
        <p className="text-ink-500 text-base sm:text-lg mt-4 max-w-xl">
          FIRSTBLOOD connects hospitals, donors, and independent recipients in real time — no waiting rooms, no cold calls.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-7">
          <Link to="/register">
            <Button size="lg">
              Create an account <ArrowRight size={16} />
            </Button>
          </Link>
          <Link to="/public">
            <Button size="lg" variant="secondary">
              <PhoneCall size={16} /> Need blood now?
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick facts */}
      <div className="grid sm:grid-cols-3 gap-4 mt-12">
        {STATS.map((s) => (
          <div key={s.label} className="flex items-start gap-3">
            <span className="bg-white border border-ink-200 rounded-lg p-2 text-blood-600 shadow-soft shrink-0">
              <s.icon size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-800">{s.label}</p>
              <p className="text-xs text-ink-500 mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Role cards */}
      <div className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400 mb-4">Already have a role?</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {ROLES.map((r) => (
            <Card key={r.title} className="p-5 flex flex-col hover:shadow-card transition-shadow">
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3 ${r.tone}`}>
                <r.icon size={20} />
              </span>
              <h3 className="font-semibold text-ink-900">{r.title}</h3>
              <p className="text-sm text-ink-500 mt-1 flex-1">{r.desc}</p>
              <Link to={r.to} className="mt-4">
                <Button variant="secondary" className="w-full justify-center">
                  {r.cta} <ArrowRight size={14} />
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink-400 mt-10">
        New donor or hospital? <Link to="/register" className="text-blood-600 font-medium hover:underline">Register here</Link> — takes under a minute.
      </p>
    </div>
  );
}
