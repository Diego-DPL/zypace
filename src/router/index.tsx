import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import HomePage from '../pages/HomePage';
import RacesPage from '../pages/RacesPage';
import CalendarPage from '../pages/CalendarPage';
import SettingsPage from '../pages/SettingsPage';
import StravaCallbackPage from '../pages/StravaCallbackPage';
import TrainingPlanPage from '../pages/TrainingPlanPage';
import AdminPage from '../pages/AdminPage';
import SupportPage from '../pages/SupportPage';
import Layout from '../components/Layout';
import PrivacyPage from '../pages/PrivacyPage';
import TermsPage from '../pages/TermsPage';
import SecurityPage from '../pages/SecurityPage';
import CookiesPage from '../pages/CookiesPage';
import { useAuth } from '../context/AuthContext';

const AppRouter = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
      </div>
    );
  }

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={!user ? <LandingPage /> : <Navigate to="/app" />} />
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/app" />} />
          <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/app" />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/app" element={user ? <HomePage /> : <Navigate to="/" />} />
          <Route path="/calendar" element={user ? <CalendarPage /> : <Navigate to="/" />} />
          <Route path="/races" element={user ? <RacesPage /> : <Navigate to="/" />} />
          <Route path="/settings" element={user ? <SettingsPage /> : <Navigate to="/" />} />
          <Route path="/training-plan" element={user ? <TrainingPlanPage /> : <Navigate to="/" />} />
          <Route path="/support" element={user ? <SupportPage /> : <Navigate to="/" />} />
          <Route path="/admin" element={role === 'admin' ? <AdminPage /> : <Navigate to="/app" />} />
          <Route path="/strava-callback" element={<StravaCallbackPage />} />

          <Route path="*" element={<Navigate to={user ? "/app" : "/"} />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default AppRouter;
