import { useEffect, useState } from "react";
import { getSocket } from "../services/socket";
import { useAuthStore } from "../store/authStore";

// Crisp, high-contrast toast for real-time alerts — the "attentive" alert
// surface referenced in the project plan. Urgency drives color; toasts
// auto-dismiss but stay long enough to read (8s).
const URGENCY_STYLES = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  default: "bg-blood-600",
};

export default function ToastStack() {
  const [toasts, setToasts] = useState([]);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Re-subscribe whenever the auth token changes (login/logout/role switch)
  // since ToastStack lives for the whole app lifetime, not just one page.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNotification = (n) => {
      const id = n.id || crypto.randomUUID();
      const urgency = /critical/i.test(n.title) ? "critical" : /urgent/i.test(n.title) ? "high" : "default";
      setToasts((prev) => [...prev, { ...n, id, urgency }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000);
    };

    socket.on("notification:new", onNotification);
    return () => socket.off("notification:new", onNotification);
  }, [accessToken]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 w-80 max-w-[90vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${URGENCY_STYLES[t.urgency]} text-white rounded-xl shadow-lift p-3.5 animate-slide-in-right`}
        >
          <p className="font-semibold text-sm">{t.title}</p>
          <p className="text-xs opacity-90 mt-0.5">{t.body}</p>
        </div>
      ))}
    </div>
  );
}
