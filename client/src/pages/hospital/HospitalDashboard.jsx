import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Building2, MapPin, Pencil, CheckCircle2 } from "lucide-react";
import { api } from "../../services/api";
import { getSocket } from "../../services/socket";
import { reverseGeocodeCity } from "../../services/geocode";
import { Card, CardBody, Button, Input, Badge, EmptyState } from "../../components/ui";

const STATUS_TONE = {
  OPEN: "gray", PARTIAL: "amber", FULFILLED: "green", CANCELLED: "red", EXPIRED: "gray",
};

export default function HospitalDashboard() {
  const qc = useQueryClient();
  const { data: requests = [] } = useQuery({
    queryKey: ["hospital-requests"],
    queryFn: () => api.get("/hospitals/me/requests").then((r) => r.data),
    refetchInterval: 15000,
  });
  const { data: profile } = useQuery({
    queryKey: ["hospital-me"],
    queryFn: () => api.get("/hospitals/me").then((r) => r.data),
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ["hospital-requests"] });
    socket.on("notification:new", refresh);
    socket.on("request:updated", refresh);
    return () => {
      socket.off("notification:new", refresh);
      socket.off("request:updated", refresh);
    };
  }, [qc]);

  return (
    <div className="py-6 space-y-6">
      <HospitalProfileCard profile={profile} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Your requests</h1>
          <p className="text-sm text-ink-500 mt-0.5">{requests.length} total</p>
        </div>
        <Link to="/hospital/requests/new">
          <Button size="lg"><Plus size={16} /> New request</Button>
        </Link>
      </div>

      <div className="grid gap-3">
        {requests.map((r) => {
          const accepted = r.responses.filter((x) => x.status === "ACCEPTED").length;
          return (
            <Link to={`/hospital/requests/${r.id}`} key={r.id}>
              <Card className="p-4 hover:shadow-card transition-shadow">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink-900">{r.bloodGroup} · {r.unitsClaimed}/{r.unitsNeeded} units</p>
                  <Badge tone={STATUS_TONE[r.status] || "gray"}>{r.status}</Badge>
                </div>
                <p className="text-xs text-ink-400 mt-1.5">
                  {r.city ? `City broadcast · ${r.city}` : `Radius broadcast · ${r.searchRadiusKm} km`} · {accepted} donor(s) accepted · {new Date(r.createdAt).toLocaleString()}
                </p>
              </Card>
            </Link>
          );
        })}
        {requests.length === 0 && (
          <EmptyState
            title="No requests yet"
            description="Create your first request to start alerting nearby eligible donors."
            action={<Link to="/hospital/requests/new"><Button size="sm"><Plus size={13} /> New request</Button></Link>}
          />
        )}
      </div>
    </div>
  );
}

// Compact view/edit panel for the hospital's own fixed city + location —
// set at registration and reused by every request (see NewRequestPage), but
// editable here in case it was wrong or the hospital has since moved.
function HospitalProfileCard({ profile }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState("");
  const [locating, setLocating] = useState(false);
  const [locStatus, setLocStatus] = useState(null);
  const [pendingCoords, setPendingCoords] = useState(null);

  const update = useMutation({
    mutationFn: (data) => api.patch("/hospitals/me", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hospital-me"] });
      setEditing(false);
      setLocStatus(null);
      setPendingCoords(null);
    },
  });

  function startEditing() {
    setCity(profile?.city || "");
    setPendingCoords(profile?.lat != null && profile?.lng != null ? { lat: profile.lat, lng: profile.lng } : null);
    setEditing(true);
  }

  function detectLocation() {
    if (!navigator.geolocation) return setLocStatus("Geolocation not supported by this browser.");
    setLocating(true);
    setLocStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPendingCoords({ lat, lng });
        try {
          const detected = await reverseGeocodeCity(lat, lng);
          if (detected) setCity(detected);
        } catch {
          // non-fatal — coordinates still update, city can be typed manually
        }
        setLocStatus("Location detected.");
        setLocating(false);
      },
      () => {
        setLocStatus("Couldn't get location — check browser permissions.");
        setLocating(false);
      }
    );
  }

  function save() {
    if (!city.trim() || !pendingCoords) return;
    update.mutate({ city: city.trim(), lat: pendingCoords.lat, lng: pendingCoords.lng });
  }

  if (!profile) return null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="bg-blue-50 text-blue-600 rounded-xl p-2.5"><Building2 size={20} /></span>
            <div>
              <h2 className="font-semibold text-ink-900">{profile.hospitalName}</h2>
              {!editing && (
                <p className="text-sm text-ink-500 mt-0.5 flex items-center gap-1">
                  {profile.city ? (
                    <><MapPin size={12} /> {profile.city}</>
                  ) : (
                    <span className="text-amber-700">No city set — city broadcasts unavailable.</span>
                  )}
                  {profile.lat == null && <span className="text-amber-700"> · No location set.</span>}
                </p>
              )}
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" size="sm" onClick={startEditing}>
              <Pencil size={12} /> Edit city / location
            </Button>
          )}
        </div>

        {editing && (
          <div className="mt-4 space-y-2.5 border-t border-ink-100 pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={detectLocation} disabled={locating}>
              {locating ? "Detecting…" : "Detect my location"}
            </Button>
            {locStatus && <span className="text-xs text-ink-500 ml-2">{locStatus}</span>}
            <Input placeholder="City, e.g. Kochi" value={city} onChange={(e) => setCity(e.target.value)} />
            {pendingCoords && (
              <p className="text-xs text-emerald-700 flex items-center gap-1">
                <CheckCircle2 size={13} /> Location set ({pendingCoords.lat.toFixed(4)}, {pendingCoords.lng.toFixed(4)}).
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!city.trim() || !pendingCoords || update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
