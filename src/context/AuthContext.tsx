import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebaseClient';

interface AuthContextType {
  user: User | null;
  role: string | null;
  firstName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser]           = useState<User | null>(null);
  const [role, setRole]           = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          if (snap.exists()) {
            const data = snap.data();
            setRole(data.role ?? 'user');
            setFirstName(data.first_name || null);
          } else {
            setRole('user');
            setFirstName(null);
          }
        } catch {
          setRole('user');
          setFirstName(null);
        }
      } else {
        setRole(null);
        setFirstName(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signOut = () => fbSignOut(auth);

  return (
    <AuthContext.Provider value={{ user, role, firstName, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
