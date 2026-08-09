import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { MapPin, Navigation, CheckCircle2, XCircle, Clock, Droplet, Smartphone } from "lucide-react";
import { api } from "../../services/api";
import { getSocket } from "../../services/socket";
import { reverseGeocodeCity } from "../../services/geocode";
import { Card, CardBody, Button, Input, Badge, EmptyState, SectionHeading } from "../../components/ui";

const URGENCY_STYLES = {
  CRITICAL: "bg-red-600",
  HIGH: "bg-orange-500",
  NORMAL: "bg-blood-600",
};
const RESPONSE_BADGE = {
  ACCEPTED: "blue", DECLINED: "gray", CANCELLED: "red", COMPLETED: "green", NO_SHOW: "red",
};

export default function DonorDashboard() {
  const qc = useQueryClient();
  const [locStatus, setLocStatus] = useState(null);
  const [cityInput, setCityInput] = useState("");
  const [cityTouched, setCityTouched] = useState(false);

  const { data: profile } = useQuery({ queryKey: ["donor-me"], queryFn: () => api.get("/donors/me").then((r) => r.data) });

  // Seed the editable city field from the loaded profile, but only until the
  // donor starts typing — don't clobber their in-progress edit on refetch.
  useEffect(() => {
    if (profile?.city && !cityTouched) setCityInput(profile.city);
  }, [profile?.city, cityTouched]);
  const { data: responses = [] } = useQuery({
    queryKey: ["donor-responses"],
    queryFn: () => api.get("/donors/me/responses").then((r) => r.data),
    refetchInterval: 30000,
  });

  // Live-refresh the list whenever a new alert or a request update arrives.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ["donor-responses"] });
    socket.on("notification:new", refresh);
    socket.on("request:updated", refresh);
    return () => {
      socket.off("notification:new", refresh);
      socket.off("request:updated", refresh);
    };
  }, [qc]);

  const toggleAvailability = useMutation({
    mutationFn: (isAvailable) => api.patch("/donors/me/availability", { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["donor-me"] }),
  });

  const updateLocation = useMutation({
    mutationFn: ({ lat, lng, city }) => api.patch("/donors/me/location", { lat, lng, ...(city ? { city } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["donor-me"] }),
  });

  const updateCity = useMutation({
    mutationFn: (city) => api.patch("/donors/me/city", { city }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["donor-me"] }),
  });

  // Gets GPS coordinates (used for distance-based matching) and tries to
  // resolve them to a city name (used for "broadcast to everyone in <city>"
  // matching) in one step — donors can still correct the city manually below.
  function shareLocation() {
    if (!navigator.geolocation) return setLocStatus("Geolocation not supported by this browser.");
    setLocStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let city;
        try {
          city = await reverseGeocodeCity(lat, lng);
        } catch {
          // non-fatal — location still saves, donor can type their city manually
        }
        updateLocation.mutate({ lat, lng, city });
        if (city) {
          setCityInput(city);
          setCityTouched(false);
        }
        setLocStatus(city ? `Location updated — detected city: ${city}.` : "Location updated (couldn't detect city automatically).");
      },
      () => setLocStatus("Couldn't get location — check browser permissions.")
    );
  }

  const respond = useMutation({
    mutationFn: ({ requestId, action }) => api.post(`/responses/${requestId}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["donor-responses"] }),
  });

  // While any response is ACCEPTED, push a coarse location ping ~once a
  // minute so the hospital can see the donor is on the way (see plan §5).
  const acceptedResponses = responses.filter((r) => r.status === "ACCEPTED");
  useEffect(() => {
    if (acceptedResponses.length === 0 || !navigator.geolocation) return;
    const socket = getSocket();
    const tick = () => {
      navigator.geolocation.getCurrentPosition((pos) => {
        acceptedResponses.forEach((r) => {
          socket?.emit("location:ping", { requestId: r.requestId, lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
      });
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [acceptedResponses.map((r) => r.requestId).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerted = responses.filter((r) => r.status === "ALERTED");
  const others = responses.filter((r) => r.status !== "ALERTED");

  return (
    <div className="space-y-6 py-6">
      {/* Donors are only matched if the mobile app is installed — a closed
          browser tab can't be alerted. Without this banner a web-only donor
          would just never hear anything and have no way to find out why. */}
      {profile?.mobileAppRequired && !profile?.hasMobileApp && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="bg-amber-100 text-amber-700 rounded-lg p-2 shrink-0">
            <Smartphone size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Install the mobile app to start receiving requests
            </p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              You can manage your profile, availability, and location here on the web — but urgent
              requests are time-critical and can only reach you reliably through push notifications.
              You won't appear in donor searches until you've signed in on the FIRSTBLOOD mobile app
              at least once.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardBody>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="bg-blood-50 text-blood-600 rounded-xl p-2.5"><Droplet size={20} /></span>
              <div>
                <h1 className="text-lg font-bold text-ink-900">{profile?.fullName}</h1>
                <p className="text-sm text-ink-500 mt-0.5">
                  Blood group <span className="font-semibold text-ink-700">{profile?.bloodGroup}</span> ·{" "}
                  {profile?.isEligibleToDonate ? (
                    <span className="text-emerald-700">eligible to donate now</span>
                  ) : (
                    <span className="text-amber-700">not yet eligible (90-day rule)</span>
                  )}
                </p>
                {profile && (
                  <p className="text-xs mt-1">
                    {profile.isMatchable ? (
                      <span className="text-emerald-700">● Currently visible to donor searches</span>
                    ) : (
                      <span className="text-ink-400">○ Not currently appearing in donor searches</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm bg-ink-50 border border-ink-200 rounded-lg px-3 py-2 cursor-pointer select-none">
              <input type="checkbox" checked={!!profile?.isAvailable} className="accent-blood-600"
                onChange={(e) => toggleAvailability.mutate(e.target.checked)} />
              Available for requests
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-ink-100 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={shareLocation}>
              <Navigation size={13} /> Update my location
            </Button>
            {locStatus && <span className="text-xs text-ink-500">{locStatus}</span>}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <label className="text-xs text-ink-500 flex items-center gap-1"><MapPin size={12} /> City (for "broadcast to everyone in a city"):</label>
            <Input
              value={cityInput}
              onChange={(e) => { setCityInput(e.target.value); setCityTouched(true); }}
              placeholder="e.g. Kochi"
              className="w-40 py-1.5"
            />
            <Button
              size="sm" variant="subtle"
              onClick={() => { updateCity.mutate(cityInput); setCityTouched(false); }}
              disabled={!cityInput.trim() || updateCity.isPending}
            >
              Save city
            </Button>
          </div>
        </CardBody>
      </Card>

      <section>
        <SectionHeading title="Incoming alerts" eyebrow="Live" action={alerted.length > 0 ? <Badge tone="blood">{alerted.length} active</Badge> : null} />
        {alerted.length === 0 && <EmptyState title="No active alerts right now" description="You'll see a card here the instant a matching request comes in." />}
        <div className="space-y-2.5">
          {alerted.map((r) => (
            <div key={r.id} className={`text-white rounded-xl p-4 shadow-card ${URGENCY_STYLES[r.request.urgency] || "bg-blood-600"}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">
                  {r.request.bloodGroup} needed · {r.request.unitsNeeded - r.request.unitsClaimed} unit(s) left
                </p>
                <span className="text-xs opacity-90 flex items-center gap-1">
                  <MapPin size={11} /> {r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km away` : "in your city"}
                </span>
              </div>
              {r.request.notes && <p className="text-sm opacity-90 mt-1">{r.request.notes}</p>}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={() => respond.mutate({ requestId: r.requestId, action: "accept" })}>
                  <CheckCircle2 size={14} /> Accept
                </Button>
                <button onClick={() => respond.mutate({ requestId: r.requestId, action: "decline" })}
                  className="text-sm font-medium bg-black/20 hover:bg-black/30 text-white rounded-lg px-4 py-2 transition-colors">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Your responses" eyebrow="History" />
        <div className="space-y-2">
          {others.map((r) => (
            <Card key={r.id} className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-800 flex items-center gap-2">
                  {r.request.bloodGroup} <Badge tone={RESPONSE_BADGE[r.status] || "gray"}>{r.status}</Badge>
                </p>
                <p className="text-xs text-ink-400 mt-1 flex items-center gap-1">
                  <Clock size={11} /> {r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : "distance n/a"} · ETA {r.etaMinutes ?? "—"} min
                </p>
              </div>
              {r.status === "ACCEPTED" && (
                <button onClick={() => respond.mutate({ requestId: r.requestId, action: "cancel" })}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                  <XCircle size={13} /> Cancel
                </button>
              )}
            </Card>
          ))}
          {others.length === 0 && <EmptyState title="No past responses yet" />}
        </div>
      </section>
    </div>
  );
}
