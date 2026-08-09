import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MapPin, Send } from "lucide-react";
import { api } from "../../services/api";
import { Card, CardBody, Button, Input, Select, Textarea, SegmentedToggle } from "../../components/ui";

const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];

// The hospital's location and city are fixed on its profile (set at
// registration, editable from the dashboard) — this form never asks for
// them again. All a hospital picks per request is blood group/units/urgency
// and whether to broadcast by radius or to everyone in its own city.
export default function NewRequestPage() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    bloodGroup: "O+",
    unitsNeeded: 1,
    urgency: "HIGH",
    broadcastScope: "RADIUS",
    searchRadiusKm: 10,
    notes: "",
    expiresInHours: 12,
  });

  const { data: profile } = useQuery({
    queryKey: ["hospital-me"],
    queryFn: () => api.get("/hospitals/me").then((r) => r.data),
  });

  const hasLocation = profile?.lat != null && profile?.lng != null;
  const hasCity = !!profile?.city;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!hasLocation) return setError("Set your hospital's location from the dashboard first.");
    if (form.broadcastScope === "CITY" && !hasCity) return setError("Set your hospital's city from the dashboard first.");

    setLoading(true);
    try {
      const payload = {
        bloodGroup: form.bloodGroup,
        unitsNeeded: Number(form.unitsNeeded),
        urgency: form.urgency,
        broadcastScope: form.broadcastScope,
        searchRadiusKm: form.broadcastScope === "RADIUS" ? Number(form.searchRadiusKm) : undefined,
        notes: form.notes || undefined,
        expiresInHours: Number(form.expiresInHours) || undefined,
      };
      const { data } = await api.post("/requests", payload);
      navigate(`/hospital/requests/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-8 mb-10">
      <h1 className="text-xl font-bold text-ink-900 mb-1">New blood request</h1>
      <p className="text-sm text-ink-500 mb-5">Broadcast to nearby donors or everyone registered in your city.</p>

      {profile && !hasLocation && (
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Your hospital's location isn't set yet — <Link to="/hospital" className="underline font-medium">set it on your dashboard</Link> before creating a request.</span>
        </div>
      )}

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Blood group</label>
                <Select value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                  {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Units needed</label>
                <Input type="number" min={1} max={20} value={form.unitsNeeded} onChange={(e) => setForm({ ...form, unitsNeeded: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Urgency</label>
              <Select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1.5">Who should see this?</label>
              <SegmentedToggle
                options={[{ value: "RADIUS", label: "By distance" }, { value: "CITY", label: "Everyone in my city" }]}
                value={form.broadcastScope}
                onChange={(v) => setForm({ ...form, broadcastScope: v })}
              />

              {form.broadcastScope === "RADIUS" && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-ink-500 mb-1">Search radius (km)</label>
                  <Input type="number" min={1} max={50} value={form.searchRadiusKm}
                    onChange={(e) => setForm({ ...form, searchRadiusKm: e.target.value })} />
                  <p className="text-xs text-ink-400 mt-1.5">
                    Nearest eligible donors around your hospital{profile?.address ? ` (${profile.address})` : ""}. Widens automatically if it stays unfilled.
                  </p>
                </div>
              )}

              {form.broadcastScope === "CITY" && (
                <p className="text-xs text-ink-500 mt-2.5 flex items-start gap-1.5">
                  <MapPin size={13} className="shrink-0 mt-0.5" />
                  {hasCity
                    ? <>Alerts every eligible donor registered in <span className="font-medium text-ink-700">{profile.city}</span>.</>
                    : "Your hospital doesn't have a city set yet."}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Notes / patient context</label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Expires in (hours)</label>
              <Input type="number" min={1} max={72} value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: e.target.value })} />
            </div>

            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            <Button disabled={loading || !hasLocation} className="w-full justify-center" size="lg">
              {loading ? "Creating…" : <><Send size={15} /> Create request</>}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
