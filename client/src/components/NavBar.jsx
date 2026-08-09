import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Droplet, LogOut, Menu, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { disconnectSocket } from "../services/socket";
import { Button } from "./ui";

const HOME_BY_ROLE = { DONOR: "/donor", HOSPITAL: "/hospital", ADMIN: "/admin" };

export default function NavBar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    disconnectSocket();
    logout();
    setMenuOpen(false);
    navigate("/login");
  }

  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-ink-200/70">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link
          to={user ? HOME_BY_ROLE[user.role] || "/" : "/"}
          className="flex items-center gap-2 font-extrabold text-lg tracking-tight text-ink-900"
        >
          <span className="bg-blood-600 text-white rounded-lg p-1.5 flex items-center justify-center">
            <Droplet size={18} fill="currentColor" />
          </span>
          FIRSTBLOOD
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-ink-500 mr-1">
                {user.email} <span className="text-ink-300">·</span> <span className="font-medium text-ink-700">{user.role}</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                <LogOut size={13} /> Log out
              </Button>
            </>
          ) : (
            <>
              <NavLink
                to="/public"
                className={({ isActive }) =>
                  `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    isActive ? "text-blood-700 bg-blood-50" : "text-ink-600 hover:text-blood-700 hover:bg-blood-50"
                  }`
                }
              >
                Need blood now?
              </NavLink>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    isActive ? "text-ink-900 bg-ink-100" : "text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                  }`
                }
              >
                Log in
              </NavLink>
              <Button variant="primary" size="md" onClick={() => navigate("/register")}>
                Register
              </Button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="sm:hidden p-2 -mr-2 text-ink-600" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="sm:hidden border-t border-ink-200 bg-white px-4 py-3 space-y-2 animate-fade-in">
          {user ? (
            <>
              <p className="text-sm text-ink-500 px-1">{user.email} · {user.role}</p>
              <Button variant="secondary" className="w-full justify-center" onClick={handleLogout}>
                <LogOut size={14} /> Log out
              </Button>
            </>
          ) : (
            <>
              <Link to="/public" onClick={() => setMenuOpen(false)} className="block text-sm font-medium text-ink-700 px-3 py-2 rounded-lg hover:bg-ink-100">
                Need blood now?
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)} className="block text-sm font-medium text-ink-700 px-3 py-2 rounded-lg hover:bg-ink-100">
                Log in
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} className="block text-center text-sm font-semibold text-white bg-blood-600 hover:bg-blood-700 px-3 py-2.5 rounded-lg">
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
