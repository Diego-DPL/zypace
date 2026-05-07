import React from 'react';
import AppHeader from './AppHeader';
import AppFooter from './AppFooter';
import CookieConsentBanner from './CookieConsentBanner';
import NPSModal from './NPSModal';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      {user && <AppHeader />}
      <div className="flex-1">{children}</div>
      <AppFooter />
      <CookieConsentBanner />
      {user && <NPSModal />}
    </div>
  );
};

export default Layout;
