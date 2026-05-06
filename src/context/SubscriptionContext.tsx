import { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from './AuthContext';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | null;

interface SubscriptionContextType {
  /** True if the user can access the app (active/trialing subscription OR exempt). */
  hasAccess:          boolean;
  isExempt:           boolean;
  subscriptionStatus: SubscriptionStatus;
  /** Unix ms timestamp of current period end, or null. */
  periodEnd:          number | null;
  adminPromoCode:     string | null;
  loading:            boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

  const [isExempt,           setIsExempt]           = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(null);
  const [periodEnd,          setPeriodEnd]          = useState<number | null>(null);
  const [adminPromoCode,     setAdminPromoCode]     = useState<string | null>(null);
  const [loading,            setLoading]            = useState(true);

  useEffect(() => {
    if (!user) {
      setIsExempt(false);
      setSubscriptionStatus(null);
      setPeriodEnd(null);
      setAdminPromoCode(null);
      setLoading(false);
      return;
    }

    // Real-time listener so subscription state updates instantly after checkout
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setIsExempt(!!data.is_exempt);
          setSubscriptionStatus((data.subscription_status as SubscriptionStatus) ?? null);
          setPeriodEnd(data.subscription_current_period_end?.toMillis?.() ?? null);
          setAdminPromoCode((data.admin_promo_code as string | undefined) ?? null);
        }
        setLoading(false);
      },
      () => { setLoading(false); },
    );

    return unsub;
  }, [user]);

  const hasAccess =
    isExempt ||
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'trialing';

  return (
    <SubscriptionContext.Provider
      value={{ hasAccess, isExempt, subscriptionStatus, periodEnd, adminPromoCode, loading }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
};
