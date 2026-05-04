import { Link } from 'react-router-dom';
import zypaceLogo from '../assets/zypace_logo_letras.png';

const LandingHeader = () => {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-40 backdrop-blur">
      <Link to="/">
        <img src={zypaceLogo} alt="Zypace" className="h-8 w-auto" />
      </Link>
      <nav className="flex items-center gap-3">
        <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-lime-600 transition-colors px-3 py-2">Iniciar Sesión</Link>
        <Link to="/register" className="bg-lime-400 text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-lime-500 transition-colors">Comenzar Gratis</Link>
      </nav>
    </header>
  );
};

export default LandingHeader;
