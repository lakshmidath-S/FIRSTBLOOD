import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, MapPin, CheckCircle2 } from "lucide-react";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { reverseGeocodeCity } from "../../services/geocode";
import { Button, Card, CardBody, Input, Select, SegmentedToggle } from "../../components/ui";

const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
const HOME_BY_ROLE = { DONOR: "/donor", HOSPITAL: "/hospital" };

export default function RegisterPage() {
  const [role, setRole] = useState("DONOR");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [hospitalName, setHospitalName] = useState("");
  const [address, setAddress] = useState("");
  // A hospital's city + coordinates are fixed at registration and reused
  // for every request it creates afterwards — never asked again per request.
  const [city, setCity] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locStatus, setLocStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  function detectLocation() {
    if (!navigator.geolocation) return setLocStatus("Geolocation not supported by this browser — enter your city manually.");
    setLocating(true);
    setLocStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        try {
          const detected = await reverseGeocodeCity(latitude, longitude);
          if (detected) setCity(detected);
          setLocStatus(detected ? `Detected ${detected} — adjust below if that's not quite right.` : "Location detected. Enter your city below.");
        } catch {
          setLocStatus("Location detected. Enter your city below.");
        }
        setLocating(false);
      },
      () => {
        setLocStatus("Couldn't get your location — check browser permissions and try again.");
        setLocating(false);
      }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (role === "HOSPITAL") {
      if (!city.trim()) return setError("Set your hospital's city (use \"Detect my location\" or type it in).");
      if (lat == null || lng == null) return setError("Set your hospital's location with \"Detect my location\" before creating an account.");
    }

    setLoading(true);
    try {
      const profile = role === "DONOR"
        ? { fullName, bloodGroup }
        : { hospitalName, address, city: city.trim(), lat, lng };

      const { data } = await api.post("/auth/register", { role, email, password, phone, profile });
      setAuth(data.user, data.accessToken);
      navigate(HOME_BY_ROLE[data.user.role] || "/");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 sm:mt-14 mb-10">
      <div className="text-center mb-6">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blood-600 text-white mb-3">
          <UserPlus size={20} />
        </span>
        <h1 className="text-xl font-bold text-ink-900">Create an account</h1>
        <p className="text-sm text-ink-500 mt-1">Join as a donor or a hospital — takes under a minute.</p>
      </div>

      <Card>
        <CardBody>
          <SegmentedToggle
            options={[{ value: "DONOR", label: "Donor" }, { value: "HOSPITAL", label: "Hospital" }]}
            value={role}
            onChange={setRole}
            className="mb-4"
          />

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Email</label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Password</label>
              <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Phone (optional)</label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
            </div>

            {role === "DONOR" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-500 mb-1">Full name</label>
                  <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-500 mb-1">Blood group</label>
                  <Select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                    {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </Select>
                </div>
              </>
            )}

            {role === "HOSPITAL" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-500 mb-1">Hospital name</label>
                  <Input required value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} placeholder="e.g. Kochi City General Hospital" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-500 mb-1">Address (optional)</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area" />
                </div>

                <div className="border border-ink-200 rounded-lg p-3.5 bg-ink-50 space-y-2.5">
                  <p className="text-xs text-ink-500 flex items-start gap-1.5">
                    <MapPin size={13} className="shrink-0 mt-0.5" />
                    Set your city and location once — every request you create afterwards reuses it automatically.
                  </p>
                  <Button type="button" variant="secondary" size="sm" onClick={detectLocation} disabled={locating}>
                    {locating ? "Detecting…" : "Detect my location"}
                  </Button>
                  {locStatus && <p className="text-xs text-ink-500">{locStatus}</p>}
                  <Input required placeholder="City, e.g. Kochi" value={city} onChange={(e) => setCity(e.target.value)} />
                  {lat != null && lng != null && (
                    <p className="text-xs text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 size={13} /> Location set ({lat.toFixed(4)}, {lng.toFixed(4)}).
                    </p>
                  )}
                </div>
              </>
            )}

            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            <Button disabled={loading} className="w-full justify-center" size="lg">
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="text-xs text-ink-400 mt-5 text-center">
        Already have an account? <Link to="/login" className="text-blood-600 font-medium hover:underline">Log in</Link>.
      </p>
    </div>
  );
}
