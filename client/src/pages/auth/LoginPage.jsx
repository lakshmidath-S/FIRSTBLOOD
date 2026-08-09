import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { Button, Card, CardBody, Input } from "../../components/ui";

const HOME_BY_ROLE = { DONOR: "/donor", HOSPITAL: "/hospital", ADMIN: "/admin" };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth(data.user, data.accessToken);
      navigate(HOME_BY_ROLE[data.user.role] || "/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-10 sm:mt-16">
      <div className="text-center mb-6">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blood-600 text-white mb-3">
          <LogIn size={20} />
        </span>
        <h1 className="text-xl font-bold text-ink-900">Welcome back</h1>
        <p className="text-sm text-ink-500 mt-1">Log in to your donor, hospital, or admin account.</p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Email</label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Password</label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            <Button disabled={loading} className="w-full justify-center" size="lg">
              {loading ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="text-xs text-ink-400 mt-5 text-center">
        Recipients without an account should use{" "}
        <Link to="/public" className="text-blood-600 font-medium hover:underline">the phone/OTP request page</Link>.
      </p>
      <p className="text-xs text-ink-400 mt-1.5 text-center">
        New here? <Link to="/register" className="text-blood-600 font-medium hover:underline">Create an account</Link>.
      </p>
    </div>
  );
}
