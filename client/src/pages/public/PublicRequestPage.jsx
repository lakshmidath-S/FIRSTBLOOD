import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Phone, ShieldCheck, Navigation, Send, ArrowLeft, Clock, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { reverseGeocodeCity } from "../../services/geocode";
import { getSocket } from "../../services/socket";
import { Card, CardBody, Button, Input, Select, Textarea, Badge, SegmentedToggle, EmptyState } from "../../components/ui";

const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
const STEPS = { PHONE: "phone", OTP: "otp", REQUEST: "request", TRACKING: "tracking" };

const STATUS_TONE = {
  ALERTED: "gray", ACCEPTED: "blue", DECLINED: "gray", CANCELLED: "red", COMPLETED: "green", NO_SHOW: "red",
};

export default function PublicRequestPage() {
  const [step, setStep] = useState(STEPS.PHONE);
  const [phone, setPhone] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [devOtp, setDevOtp] = useState(null); // shown because delivery is simulated, not sent via real SMS
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);

  // scope: "RADIUS" = match nearby eligible donors (existing distance-ranked
  // behavior). "CITY" = broadcast to every eligible donor registered in a
  // chosen city, regardless of distance.
  const [form, setForm] = useState({
    bloodGroup: "O+",
    unitsNeeded: 1,
    urgency: "HIGH",
    lat: "",
    lng: "",
    notes: "",
    scope: "RADIUS",
    city: "",
  });

  // A verified OTP session only lasts an hour and a new one is issued every
  // login, so past broadcasts are looked up by phone number instead —
  // otherwise a returning visitor would see nothing and assume their
  // earlier request had vanished, when it's just not tied to this session.
  const { data: myRequests = [], refetch: refetchMine } = useQuery({
    queryKey: ["public-my-requests"],
    queryFn: () => api.get("/requests/public/mine").then((r) => r.data),
    enabled: step === STEPS.REQUEST && !!accessToken,
  });

  async function requestOtp(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/request", { phone });
      setSessionId(data.sessionId);
      setDevOtp(data.otp);
      setStep(STEPS.OTP);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { sessionId, otp });
      setAuth({ role: "public", email: phone }, data.accessToken);
      setStep(STEPS.REQUEST);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Sets the receiver's own location first — used for RADIUS matching, and
  // also used to suggest a city name for CITY-scoped broadcasting.
  function useMyLocation() {
    setLocating(true);
    setError(null);
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let city = "";
        try {
          city = (await reverseGeocodeCity(lat, lng)) || "";
        } catch {
          // non-fatal — receiver can still type a city manually below
        }
        setForm((f) => ({ ...f, lat, lng, city: f.city || city }));
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location — enter it manually or try again.");
        setLocating(false);
      }
    );
  }

  async function submitRequest(e) {
    e.preventDefault();
    setError(null);
    if (form.scope === "CITY" && !form.city.trim()) {
      return setError("Enter a city to broadcast to.");
    }
    setLoading(true);
    try {
      const { scope, city, ...rest } = form;
      const { data } = await api.post("/requests/public", {
        ...rest,
        unitsNeeded: Number(form.unitsNeeded),
        lat: Number(form.lat),
        lng: Number(form.lng),
        ...(scope === "CITY" ? { city: city.trim() } : {}),
      });
      setActiveRequestId(data.id);
      setStep(STEPS.TRACKING);
      refetchMine();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 mb-10">
      {step !== STEPS.TRACKING && (
        <div className="text-center mb-6">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blood-600 text-white mb-3">
            <Phone size={19} />
          </span>
          <h1 className="text-xl font-bold text-ink-900">Request blood — no account needed</h1>
          <p className="text-sm text-ink-500 mt-1">Verify your phone, then broadcast a request to eligible donors.</p>
        </div>
      )}

      {step === STEPS.PHONE && (
        <Card>
          <CardBody>
            <form onSubmit={requestOtp} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Phone number</label>
                <Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
              </div>
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <Button disabled={loading} className="w-full justify-center" size="lg">
                {loading ? "Sending…" : "Send OTP"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {step === STEPS.OTP && (
        <Card>
          <CardBody>
            <form onSubmit={verifyOtp} className="space-y-3.5">
              <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5 flex items-start gap-1.5">
                <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                SMS delivery is simulated in this build — your OTP is <strong>{devOtp}</strong>.
              </p>
              <Input required maxLength={6} placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} className="tracking-widest text-center" />
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <Button disabled={loading} className="w-full justify-center" size="lg">
                {loading ? "Verifying…" : "Verify"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {step === STEPS.REQUEST && (
        <>
          {myRequests.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">Your previous requests</p>
              <div className="space-y-1.5">
                {myRequests.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setActiveRequestId(r.id); setStep(STEPS.TRACKING); }}
                    className="w-full text-left text-xs bg-white border border-ink-200 rounded-lg px-3 py-2 hover:border-blood-300 hover:bg-blood-50/40 transition-colors flex justify-between items-center"
                  >
                    <span className="flex items-center gap-2"><Badge tone="blood">{r.bloodGroup}</Badge> {r.unitsClaimed}/{r.unitsNeeded} · {r.status}</span>
                    <span className="text-ink-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardBody>
              <form onSubmit={submitRequest} className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">1. Your location</p>
                  <div className="flex gap-2 mb-2">
                    <Input required placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                    <Input required placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={useMyLocation} disabled={locating}>
                    <Navigation size={12} /> {locating ? "Detecting…" : "Use my current location"}
                  </Button>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">2. Who should see this?</p>
                  <SegmentedToggle
                    options={[{ value: "RADIUS", label: "Nearby donors" }, { value: "CITY", label: "Everyone in a city" }]}
                    value={form.scope}
                    onChange={(v) => setForm({ ...form, scope: v })}
                  />
                  {form.scope === "RADIUS" ? (
                    <p className="text-xs text-ink-400 mt-2">Matches the closest eligible donors first, widening the search area if too few respond.</p>
                  ) : (
                    <div className="mt-2.5">
                      <Input required placeholder="City, e.g. Kochi" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                      <p className="text-xs text-ink-400 mt-1.5">Alerts every eligible donor registered in this city, regardless of exact distance.</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-500 mb-1.5 uppercase tracking-wide">3. What's needed</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                      {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </Select>
                    <Input type="number" min={1} max={20} value={form.unitsNeeded} onChange={(e) => setForm({ ...form, unitsNeeded: e.target.value })} placeholder="Units" />
                  </div>
                  <Select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} className="mt-2">
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="NORMAL">Normal</option>
                  </Select>
                  <Textarea placeholder="Notes (hospital name, patient context…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-2" />
                </div>

                {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
                <Button disabled={loading} className="w-full justify-center" size="lg">
                  {loading ? "Broadcasting…" : <><Send size={15} /> Broadcast request</>}
                </Button>
              </form>
            </CardBody>
          </Card>
        </>
      )}

      {step === STEPS.TRACKING && activeRequestId && (
        <RequestTracker requestId={activeRequestId} onBack={() => setStep(STEPS.REQUEST)} />
      )}
    </div>
  );
}

// Live status view for a single broadcast — this is what was missing before:
// donor accept/decline/cancel events were already being emitted over the
// request's socket room, nothing on the independent-receiver side was ever
// listening for them.
function RequestTracker({ requestId, onBack }) {
  const qc = useQueryClient();

  const { data: request } = useQuery({
    queryKey: ["public-request", requestId],
    queryFn: () => api.get(`/requests/${requestId}`).then((r) => r.data),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("request:subscribe", requestId);
    const onUpdate = () => qc.invalidateQueries({ queryKey: ["public-request", requestId] });
    socket.on("request:updated", onUpdate);
    return () => {
      socket.emit("request:unsubscribe", requestId);
      socket.off("request:updated", onUpdate);
    };
  }, [requestId, qc]);

  const markAction = useMutation({
    mutationFn: ({ donorId, action }) => api.post(`/responses/${requestId}/donors/${donorId}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-request", requestId] }),
  });

  if (!request) return <p className="text-sm text-ink-400 py-6 text-center">Loading…</p>;

  const accepted = request.responses.filter((r) => r.status === "ACCEPTED" || r.status === "COMPLETED");

  return (
    <div>
      <button onClick={onBack} className="text-xs text-blood-600 hover:text-blood-700 font-medium flex items-center gap-1 mb-4">
        <ArrowLeft size={13} /> New request / previous requests
      </button>

      <Card className="bg-ink-50/60">
        <CardBody>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-semibold text-ink-900">
              {request.bloodGroup} · {request.unitsClaimed}/{request.unitsNeeded} units
            </p>
            <Badge tone={STATUS_TONE[request.status] || "gray"}>{request.status}</Badge>
          </div>
          <p className="text-xs text-ink-500 mt-1.5">
            {accepted.length === 0
              ? "Waiting for a donor to respond…"
              : `${accepted.length} donor(s) accepted so far.`}
          </p>
        </CardBody>
      </Card>

      <div className="mt-3 space-y-2">
        {request.responses.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-ink-700">
                <Clock size={12} className="text-ink-400" /> {r.donor?.fullName || "Donor"} · {r.donor?.bloodGroup}
              </span>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[r.status] || "gray"}>{r.status}</Badge>
                {r.status === "ACCEPTED" && (
                  <>
                    <Button size="sm" variant="success" onClick={() => markAction.mutate({ donorId: r.donorId, action: "complete" })}>
                      <CheckCircle2 size={13} /> Mark donated
                    </Button>
                    <Button size="sm" variant="dangerSubtle" onClick={() => markAction.mutate({ donorId: r.donorId, action: "no-show" })}>
                      <XCircle size={13} /> No-show
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
        {request.responses.length === 0 && <EmptyState title="No donors alerted yet" />}
      </div>
    </div>
  );
}
