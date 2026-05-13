import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useState } from 'react';
import zypaceLogo from '../assets/zypace_logo_letras.png';

const AppHeader = () => {
  const { user, role, signOut } = useAuth();
  const { subscriptionStatus, isExempt } = useSubscription();
  const navigate = useNavigate();
  const hasBillingIssue = !isExempt && (subscriptionStatus === 'past_due' || subscriptionStatus === 'incomplete');

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const [open, setOpen] = useState(false);
  const shortEmail = user?.email?.split('@')[0];

  return (
    <header className="bg-zinc-950/90 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80 border-b border-zinc-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-zinc-400 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-lime-400"
            onClick={() => setOpen(o => !o)}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              {open ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
          <Link to="/app">
            <img src={zypaceLogo} alt="Zypace" className="h-8 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          </Link>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link to="/calendar" className="text-zinc-400 hover:text-lime-400 transition-colors">Calendario</Link>
          <Link to="/profile" className="text-zinc-400 hover:text-lime-400 transition-colors">Perfil</Link>
          <Link to="/settings" className="text-zinc-400 hover:text-lime-400 transition-colors flex items-center gap-1.5">
            Ajustes
            {hasBillingIssue && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </Link>
          {role === 'admin' && (
            <Link to="/admin" className="text-lime-400 hover:text-lime-300 font-semibold transition-colors flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />Admin
            </Link>
          )}
        </nav>
        <div className="hidden md:flex items-center gap-4">
          <span className="text-zinc-500 text-sm max-w-[140px] truncate" title={user?.email ?? undefined}>Hola, {shortEmail}</span>
          <button
            onClick={handleLogout}
            className="bg-lime-400 text-black font-semibold py-2 px-4 rounded-md hover:bg-lime-500 active:bg-lime-600 transition-colors text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
      {/* Mobile panel */}
      <div className={`md:hidden overflow-hidden transition-[max-height] duration-300 ease-in-out border-t border-zinc-800 ${open ? 'max-h-96' : 'max-h-0'}`}>
        <div className="px-4 pt-2 pb-4 space-y-4 text-sm bg-zinc-950">
          <div className="flex flex-col gap-2">
            <Link onClick={() => setOpen(false)} to="/calendar" className="py-2 px-3 rounded hover:bg-zinc-800 text-zinc-300">Calendario</Link>
            <Link onClick={() => setOpen(false)} to="/profile" className="py-2 px-3 rounded hover:bg-zinc-800 text-zinc-300">Perfil</Link>
            <Link onClick={() => setOpen(false)} to="/settings" className="py-2 px-3 rounded hover:bg-zinc-800 text-zinc-300 flex items-center gap-2">
              Ajustes
              {hasBillingIssue && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
            </Link>
            {role === 'admin' && (
              <Link onClick={() => setOpen(false)} to="/admin" className="py-2 px-3 rounded hover:bg-zinc-800 text-lime-400 font-semibold flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />Panel Admin
              </Link>
            )}
          </div>
          <div className="border-t border-zinc-800 pt-3 flex items-center justify-between">
            <span className="text-zinc-500 text-xs">{user?.email}</span>
            <button onClick={handleLogout} className="bg-lime-400 text-black text-xs font-semibold py-2 px-3 rounded-md hover:bg-lime-500">Salir</button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
