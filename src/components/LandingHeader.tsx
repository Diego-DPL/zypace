import { Link } from 'react-router-dom';

const LandingHeader = () => {
  return (
    <header className="bg-white shadow-md p-4 flex justify-between items-center">
      <div className="text-xl font-bold">Zypace</div>
      <nav>
        <Link to="/login" className="mr-4">Iniciar Sesión</Link>
        <Link to="/register" className="bg-blue-500 text-white px-4 py-2 rounded">Registrarse</Link>
      </nav>
    </header>
  );
};

export default LandingHeader;
