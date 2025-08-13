import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const AppHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header className="bg-white shadow-md">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/app" className="text-2xl font-bold text-orange-500">Zypace</Link>
        <nav className="flex items-center space-x-8">
          <Link to="/races" className="text-gray-600 hover:text-orange-500 transition-colors">Calendario</Link>
          <Link to="/training-plan" className="text-gray-600 hover:text-orange-500 transition-colors">Mi Plan</Link>
          <Link to="/settings" className="text-gray-600 hover:text-orange-500 transition-colors">Ajustes</Link>
        </nav>
        <div className="flex items-center">
          <span className="text-gray-800 mr-4">Hola, {user?.email}</span>
          <button 
            onClick={handleLogout}
            className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-600 transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
