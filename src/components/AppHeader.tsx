import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useState } from 'react';

const AppHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const [open, setOpen] = useState(false);
  const shortEmail = user?.email?.split('@')[0];

  return (
    <header className="bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            onClick={() => setOpen(o => !o)}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {open ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
          <Link to="/app" className="text-xl sm:text-2xl font-bold tracking-tight text-orange-500">Zypace</Link>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link to="/races" className="text-gray-600 hover:text-orange-500 transition-colors">Calendario</Link>
          <Link to="/training-plan" className="text-gray-600 hover:text-orange-500 transition-colors">Mi Plan</Link>
          <Link to="/settings" className="text-gray-600 hover:text-orange-500 transition-colors">Ajustes</Link>
        </nav>
        <div className="hidden md:flex items-center gap-4">
          <span className="text-gray-700 max-w-[140px] truncate" title={user?.email}>Hola, {shortEmail}</span>
          <button
            onClick={handleLogout}
            className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 active:bg-orange-700 transition-colors text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
      {/* Mobile panel */}
      <div
        className={`md:hidden overflow-hidden transition-[max-height] duration-300 ease-in-out border-t border-gray-200 ${open ? 'max-h-96' : 'max-h-0'}`}
      >
        <div className="px-4 pt-2 pb-4 space-y-4 text-sm bg-white/95 backdrop-blur">
          <div className="flex flex-col gap-2">
            <Link onClick={() => setOpen(false)} to="/races" className="py-2 px-3 rounded hover:bg-gray-100 text-gray-700">Calendario</Link>
            <Link onClick={() => setOpen(false)} to="/training-plan" className="py-2 px-3 rounded hover:bg-gray-100 text-gray-700">Mi Plan</Link>
            <Link onClick={() => setOpen(false)} to="/settings" className="py-2 px-3 rounded hover:bg-gray-100 text-gray-700">Ajustes</Link>
          </div>
          <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
            <span className="text-gray-600 text-xs">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="bg-orange-500 text-white text-xs font-semibold py-2 px-3 rounded-md hover:bg-orange-600"
            >Salir</button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
