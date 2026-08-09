import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Clock, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../services/api";
import { getSocket } from "../../services/socket";
import { Card, CardBody, Button, Badge, EmptyState } from "../../components/ui";

const STATUS_TONE = {
  ALERTED: "gray", ACCEPTED: "blue", DECLINED: "gray", CANCELLED: "red", COMPLETED: "green", NO_SHOW: "red",
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [donorLocations, setDonorLocations] = useState({}); // donorId -> {lat,lng,recordedAt}

  const { data: request } = useQuery({
    queryKey: ["request", id],
    queryFn: () => api.get(`/requests/${id}`).then((r) => r.data),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("request:subscribe", id);

    const onUpdate = () => qc.invalidateQueries({ queryKey: ["request", id] });
    const onLocation = (payload) => {
      if (payload.requestId !== undefined && payload.requestId !== id) return;
      setDonorLocations((prev) => ({ ...prev, [payload.donorId]: payload }));
    };

    socket.on("request:updated", onUpdate);
    socket.on("notification:new", onUpdate);
    socket.on("donor:location_update", onLocation);
    return () => {
      socket.emit("request:unsubscribe", id);
      socket.off("request:updated", onUpdate);
      socket.off("notification:new", onUpdate);
      socket.off("donor:location_update", onLocation);
    };
  }, [id, qc]);

  const markAction = useMutation({
    mutationFn: ({ donorId, action }) => api.post(`/responses/${id}/donors/${donorId}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["request", id] }),
  });

  if (!request) return <p className="py-8 text-sm text-ink-400">Loading…</p>;

  const accepted = request.responses.filter((r) => r.status === "ACCEPTED");
  const center = [request.lat, request.lng];

  return (
    <div className="py-6 space-y-5">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-lg font-bold text-ink-900">
              {request.bloodGroup} · {request.unitsClaimed}/{request.unitsNeeded} units · <Badge tone={STATUS_TONE[request.status] || "gray"} className="ml-1 align-middle">{request.status}</Badge>
            </h1>
            <span className="text-xs text-ink-400 flex items-center gap-1">
              <MapPin size={12} />
              {request.city ? `Everyone in ${request.city}` : `Radius ${request.searchRadiusKm} km`}
            </span>
          </div>
          {request.notes && <p className="text-sm text-ink-600 mt-2">{request.notes}</p>}
        </CardBody>
      </Card>

      {accepted.length > 0 && (
        <Card className="overflow-hidden">
          <div style={{ height: 320 }}>
            <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <CircleMarker center={center} radius={10} pathOptions={{ color: "#b91c1c", fillColor: "#dc2626", fillOpacity: 1 }}>
                <Popup>Request location</Popup>
              </CircleMarker>
              {accepted.map((r) => {
                const loc = donorLocations[r.donorId];
                if (!loc) return null;
                return (
                  <CircleMarker key={r.donorId} center={[loc.lat, loc.lng]} radius={8} pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 1 }}>
                    <Popup>{r.donor?.fullName || "Donor"} — last updated {new Date(loc.recordedAt).toLocaleTimeString()}</Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          <p className="text-xs text-ink-400 p-2.5 bg-ink-50 border-t border-ink-100">
            Donor positions refresh roughly once a minute — treat as approximate, not turn-by-turn.
          </p>
        </Card>
      )}

      <div>
        <h2 className="font-semibold text-ink-900 mb-2.5">Donor responses</h2>
        <div className="space-y-2">
          {request.responses.map((r) => (
            <Card key={r.id} className="p-3.5 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-medium text-ink-800">{r.donor?.fullName || r.donorId} · {r.donor?.bloodGroup}</p>
                <p className="text-xs text-ink-400 mt-0.5 flex items-center gap-1">
                  <Clock size={11} /> {r.distanceKm?.toFixed(1) ?? "—"} km · ETA {r.etaMinutes ?? "—"} min
                </p>
              </div>
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
            </Card>
          ))}
          {request.responses.length === 0 && <EmptyState title="No donors alerted yet" />}
        </div>
      </div>
    </div>
  );
}
