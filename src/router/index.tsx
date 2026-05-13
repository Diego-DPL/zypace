import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { trackPageView, trackEvent } from '../lib/analytics';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

// ── Lazy-loaded pages ─────────────────────────────────────────────────
// Each page is only downloaded when the user first navigates to it.
const LandingPage        = lazy(() => import('../pages/LandingPage'));
const LoginPage          = lazy(() => import('../pages/LoginPage'));
const RegisterPage       = lazy(() => import('../pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'));
const SubscribePage      = lazy(() => import('../pages/SubscribePage'));
const HomePage           = lazy(() => import('../pages/HomePage'));
const CalendarPage       = lazy(() => import('../pages/CalendarPage'));
const SettingsPage       = lazy(() => import('../pages/SettingsPage'));
const StravaCallbackPage = lazy(() => import('../pages/StravaCallbackPage'));
const ProfilePage        = lazy(() => import('../pages/ProfilePage'));
const AdminPage          = lazy(() => import('../pages/AdminPage'));
const SupportPage        = lazy(() => import('../pages/SupportPage'));
const PrivacyPage        = lazy(() => import('../pages/PrivacyPage'));
const TermsPage          = lazy(() => import('../pages/TermsPage'));
const SecurityPage       = lazy(() => import('../pages/SecurityPage'));
const CookiesPage        = lazy(() => import('../pages/CookiesPage'));

const PageLoader = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
  </div>
);

/** Fires a GA4 page_view on every route change. Must be rendered inside <Router>. */
function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
    if (location.pathname === '/app' && location.search.includes('sub=ok')) {
      trackEvent('trial_start', { currency: 'EUR', value: 0 });
    }
  }, [location]);
  return null;
}

const AppRouter = () => {
  const { user, role, loading } = useAuth();
  const { hasAccess, loading: subLoading } = useSubscription();

  if (loading || subLoading) {
    return <PageLoader />;
  }

  const appElement = (el: React.ReactNode) => {
    if (!user) return <Navigate to="/" />;
    if (!hasAccess && role !== 'admin') return <Navigate to="/subscribe" />;
    return el;
  };

  return (
    <Router>
      <PageTracker />
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"               element={!user ? <LandingPage /> : <Navigate to="/app" />} />
            <Route path="/login"          element={!user ? <LoginPage /> : <Navigate to="/app" />} />
            <Route path="/register"       element={!user ? <RegisterPage /> : <Navigate to="/app" />} />
            <Route path="/forgot-password" element={!user ? <ForgotPasswordPage /> : <Navigate to="/app" />} />
            <Route path="/subscribe"      element={user ? <SubscribePage /> : <Navigate to="/register" />} />
            <Route path="/privacy"        element={<PrivacyPage />} />
            <Route path="/terms"          element={<TermsPage />} />
            <Route path="/security"       element={<SecurityPage />} />
            <Route path="/cookies"        element={<CookiesPage />} />
            <Route path="/app"            element={appElement(<HomePage />)} />
            <Route path="/calendar"       element={appElement(<CalendarPage />)} />
            <Route path="/races"          element={<Navigate to="/calendar" replace />} />
            <Route path="/settings"       element={user ? <SettingsPage /> : <Navigate to="/" />} />
            <Route path="/profile"        element={appElement(<ProfilePage />)} />
            <Route path="/training-plan"  element={<Navigate to="/calendar" replace />} />
            <Route path="/subscription"   element={<Navigate to="/settings" replace />} />
            <Route path="/support"        element={<SupportPage />} />
            <Route path="/admin"          element={role === 'admin' ? <AdminPage /> : <Navigate to="/app" />} />
            <Route path="/strava-callback" element={<StravaCallbackPage />} />
            <Route path="*"              element={<Navigate to={user ? "/app" : "/"} />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  );
};

export default AppRouter;
