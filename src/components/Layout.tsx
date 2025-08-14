import React from 'react';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';
import CookieConsentBanner from './CookieConsentBanner';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {session && <AppHeader />}
      <div className="flex-1">{children}</div>
  <AppFooter />
  <CookieConsentBanner />
    </div>
  );
};

export default Layout;
