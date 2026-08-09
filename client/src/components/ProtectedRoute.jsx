import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

// Wrap a page element: <ProtectedRoute role="DONOR"><DonorDashboard /></ProtectedRoute>
// role="public" allows the OTP-scoped token instead of a normal role.
export default function ProtectedRoute({ role, children }) {
  const { user, accessToken } = useAuthStore();

  if (!accessToken) return <Navigate to="/login" replace />;
  if (role && role !== "public" && user?.role !== role) return <Navigate to="/" replace />;

  return children;
}
