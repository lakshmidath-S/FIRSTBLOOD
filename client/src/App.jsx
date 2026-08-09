import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import ToastStack from "./components/Toast";
import ProtectedRoute from "./components/ProtectedRoute";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import PublicRequestPage from "./pages/public/PublicRequestPage";

import DonorDashboard from "./pages/donor/DonorDashboard";

import HospitalDashboard from "./pages/hospital/HospitalDashboard";
import NewRequestPage from "./pages/hospital/NewRequestPage";
import RequestDetailPage from "./pages/hospital/RequestDetailPage";

import AdminDashboard from "./pages/admin/AdminDashboard";

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-ink-50">
      <NavBar />
      <ToastStack />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/public" element={<PublicRequestPage />} />

          <Route path="/donor" element={<ProtectedRoute role="DONOR"><DonorDashboard /></ProtectedRoute>} />

          <Route path="/hospital" element={<ProtectedRoute role="HOSPITAL"><HospitalDashboard /></ProtectedRoute>} />
          <Route path="/hospital/requests/new" element={<ProtectedRoute role="HOSPITAL"><NewRequestPage /></ProtectedRoute>} />
          <Route path="/hospital/requests/:id" element={<ProtectedRoute role="HOSPITAL"><RequestDetailPage /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
