import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  RefreshCw, Sparkles, Droplets, Building2, Users, ShieldAlert, Activity, TrendingUp, MapPin,
} from "lucide-react";
import { api } from "../../services/api";
import { getSocket } from "../../services/socket";
import { Card, CardBody, SectionHeading, Button, Badge, StatCard, EmptyState } from "../../components/ui";

const STATUS_COLOR = {
  OPEN: "#94a3b8",
  PARTIAL: "#f59e0b",
  FULFILLED: "#10b981",
  CANCELLED: "#dc2626",
  EXPIRED: "#cbd5e1",
};
const RESPONSE_COLOR = {
  ALERTED: "#94a3b8",
  ACCEPTED: "#3b82f6",
  DECLINED: "#cbd5e1",
  CANCELLED: "#dc2626",
  COMPLETED: "#10b981",
  NO_SHOW: "#f59e0b",
};
const REQUEST_STATUS_BADGE = {
  OPEN: "gray", PARTIAL: "amber", FULFILLED: "green", CANCELLED: "red", EXPIRED: "gray",
};

// The LLM is asked for plain text with "Rec:"-prefixed recommendation lines
// (see analytics.service.js), but older cached narratives may still contain
// markdown-lite (**bold**, "- " bullets, "1. " numbering). This renders both
// cleanly as an intro paragraph + a recommendations list, instead of dumping
// raw markdown symbols into a <p> tag.
function parseNarrative(text) {
  if (!text) return { paragraphs: [], recs: [] };
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const paragraphs = [];
  const recs = [];
  for (const raw of lines) {
    const isRec = /^rec:/i.test(raw) || /^\d+\.\s*/.test(raw) || /^[-*]\s*/.test(raw);
    const cleaned = raw
      .replace(/^rec:\s*/i, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/^[-*]\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/^#+\s*/, "");
    if (isRec) recs.push(cleaned);
    else paragraphs.push(cleaned);
  }
  return { paragraphs, recs };
}

export default function AdminDashboard() {
  const qc = useQueryClient();

  const { data: flagged = [] } = useQuery({
    queryKey: ["admin-flagged"],
    queryFn: () => api.get("/admin/donors/flagged").then((r) => r.data),
    refetchInterval: 20000,
  });

  // Stats inside `analytics` are always computed live server-side now (only
  // the narrative paragraph is cached) — this refetch just keeps the numbers
  // and charts in sync with whatever's happening elsewhere without a manual reload.
  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => api.get("/admin/analytics").then((r) => r.data),
    refetchInterval: 20000,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: () => api.get("/admin/requests").then((r) => r.data),
    refetchInterval: 20000,
  });

  // Real-time nudge on top of the polling above: any request lifecycle
  // event or completed donation invalidates immediately instead of waiting
  // for the next 20s tick.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["admin-analytics"] });
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
    };
    socket.on("admin:request_created", refresh);
    socket.on("admin:request_updated", refresh);
    socket.on("admin:donation_completed", refresh);
    return () => {
      socket.off("admin:request_created", refresh);
      socket.off("admin:request_updated", refresh);
      socket.off("admin:donation_completed", refresh);
    };
  }, [qc]);

  const ban = useMutation({
    mutationFn: (id) => api.post(`/admin/donors/${id}/ban`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-flagged"] }),
  });

  const refreshAnalytics = useMutation({
    mutationFn: () => api.post("/admin/analytics/refresh", { sinceDays: 30 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-analytics"] }),
  });

  const stats = analytics?.stats;
  const narrative = useMemo(() => parseNarrative(analytics?.narrative), [analytics?.narrative]);

  const timeSeries = useMemo(
    () => (stats?.timeSeries || []).map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }) })),
    [stats?.timeSeries]
  );

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Admin overview</h1>
          <p className="text-sm text-ink-500 mt-0.5">Live network activity, last {stats?.periodDays ?? 30} days.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refreshAnalytics.mutate()} disabled={refreshAnalytics.isPending}>
          <RefreshCw size={13} className={refreshAnalytics.isPending ? "animate-spin" : ""} />
          {refreshAnalytics.isPending ? "Refreshing…" : "Refresh insights"}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Activity} label="Requests" value={stats?.totalRequests ?? "—"} />
        <StatCard icon={TrendingUp} label="Fulfilled" value={stats?.fulfilledRequests ?? "—"} hint={stats?.fulfillmentRate != null ? `${Math.round(stats.fulfillmentRate * 100)}% rate` : undefined} tone="success" />
        <StatCard icon={Droplets} label="Donations" value={stats?.completedDonations ?? "—"} tone="success" />
        <StatCard icon={ShieldAlert} label="No-shows" value={stats?.noShows ?? "—"} tone={stats?.noShows > 0 ? "danger" : "default"} />
        <StatCard icon={Users} label="Donors" value={stats?.donors?.total ?? "—"} hint={stats?.donors ? `${stats.donors.available} available` : undefined} />
        <StatCard icon={Building2} label="Hospitals" value={stats?.hospitals?.total ?? "—"} hint={stats?.hospitals ? `${stats.hospitals.verified} verified` : undefined} />
      </div>

      {/* Narrative */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-blood-50 text-blood-600 rounded-lg p-1.5"><Sparkles size={15} /></span>
            <h2 className="font-semibold text-ink-900">Insights</h2>
            {analytics?.generatedAt && (
              <span className="text-xs text-ink-400 ml-auto">Generated {new Date(analytics.generatedAt).toLocaleString()}</span>
            )}
          </div>
          {analytics ? (
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-2">
                {narrative.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-ink-600 leading-relaxed">{p}</p>
                ))}
              </div>
              {narrative.recs.length > 0 && (
                <div className="bg-blood-50/60 border border-blood-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blood-700 uppercase tracking-wide mb-2">Recommendations</p>
                  <ul className="space-y-1.5">
                    {narrative.recs.map((r, i) => (
                      <li key={i} className="text-xs text-ink-700 flex gap-1.5">
                        <span className="text-blood-500 font-bold">{i + 1}.</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-400">Loading…</p>
          )}
        </CardBody>
      </Card>

      {/* Trend chart */}
      <Card>
        <CardBody>
          <SectionHeading title="Requests over time" eyebrow="Trend" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fulfilledGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Area type="monotone" dataKey="requestCount" name="Requests" stroke="#b91c1c" fill="url(#reqGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="fulfilledCount" name="Fulfilled" stroke="#10b981" fill="url(#fulfilledGradient)" strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Demand by blood group */}
        <Card>
          <CardBody>
            <SectionHeading title="Demand by blood group" eyebrow="Breakdown" />
            {stats?.demandByBloodGroup?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.demandByBloodGroup} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="bloodGroup" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="count" name="Requests" fill="#b91c1c" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No requests yet" description="Blood-group demand will show up here once requests start coming in." />
            )}
          </CardBody>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardBody>
            <SectionHeading title="Request status" eyebrow="Breakdown" />
            {stats?.statusBreakdown?.some((s) => s.count > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.statusBreakdown.filter((s) => s.count > 0)}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {stats.statusBreakdown.filter((s) => s.count > 0).map((s) => (
                      <Cell key={s.status} fill={STATUS_COLOR[s.status]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No requests yet" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Donor response funnel */}
        <Card>
          <CardBody>
            <SectionHeading title="Donor response outcomes" eyebrow="Funnel" />
            {stats?.responseOutcomes?.some((s) => s.count > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.responseOutcomes} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {stats.responseOutcomes.map((s) => (
                      <Cell key={s.status} fill={RESPONSE_COLOR[s.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No donor responses yet" />
            )}
            {stats?.acceptRate != null && (
              <p className="text-xs text-ink-400 mt-2">
                Accept rate {Math.round(stats.acceptRate * 100)}%
                {stats?.noShowRate != null && ` · No-show rate ${Math.round(stats.noShowRate * 100)}%`}
                {stats?.avgAcceptedDistanceKm != null && ` · Avg. accepted distance ${stats.avgAcceptedDistanceKm} km`}
              </p>
            )}
          </CardBody>
        </Card>

        {/* Top cities */}
        <Card>
          <CardBody>
            <SectionHeading title="Top cities" eyebrow="City broadcasts" />
            {stats?.topCities?.length ? (
              <div className="space-y-2.5 mt-1">
                {stats.topCities.map((c) => {
                  const max = stats.topCities[0].count || 1;
                  return (
                    <div key={c.city}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-ink-700 font-medium"><MapPin size={11} className="text-ink-400" /> {c.city}</span>
                        <span className="text-ink-400">{c.count}</span>
                      </div>
                      <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blood-500 rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No city broadcasts yet" description="Requests broadcast by city will be ranked here." />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Flagged donors */}
      <Card>
        <CardBody>
          <SectionHeading title={`Flagged donors (${flagged.length})`} eyebrow="Trust & safety" />
          <div className="space-y-2">
            {flagged.map((d) => (
              <div key={d.userId} className="border border-ink-200 rounded-lg p-3 bg-white flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium text-ink-800">{d.fullName} · {d.bloodGroup} · <span className="text-ink-400 font-normal">{d.user?.email}</span></p>
                  <p className="text-xs text-amber-700 mt-0.5">{d.flagReason}</p>
                </div>
                {!d.user?.isBanned ? (
                  <Button variant="danger" size="sm" onClick={() => ban.mutate(d.userId)}>Ban donor</Button>
                ) : (
                  <Badge tone="red">Banned</Badge>
                )}
              </div>
            ))}
            {flagged.length === 0 && <EmptyState title="No flagged donors right now" />}
          </div>
        </CardBody>
      </Card>

      {/* Recent requests */}
      <Card>
        <CardBody>
          <SectionHeading title="Recent requests" eyebrow="Activity" />
          <div className="space-y-1.5">
            {requests.slice(0, 20).map((r) => (
              <div key={r.id} className="text-sm border border-ink-200 rounded-lg p-2.5 bg-white flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Badge tone={REQUEST_STATUS_BADGE[r.status] || "gray"}>{r.status}</Badge>
                  {r.bloodGroup} · {r.unitsClaimed}/{r.unitsNeeded}
                </span>
                <span className="text-ink-400 text-xs">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {requests.length === 0 && <EmptyState title="No requests yet" />}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
