import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebaseClient';
import { Link } from 'react-router-dom';
import zypaceLogo from '../assets/zypace_logo_letras.png';

const LoginPage = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/invalid-credential':    'Email o contraseña incorrectos.',
        'auth/user-not-found':        'No existe una cuenta con este email.',
        'auth/wrong-password':        'Contraseña incorrecta.',
        'auth/too-many-requests':     'Demasiados intentos. Espera un momento.',
      };
      setError(msg[err.code] || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-zinc-950">
      <div className="w-full max-w-md p-8 space-y-6 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex justify-center mb-2">
          <img src={zypaceLogo} alt="Zypace" className="h-9 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        <h1 className="text-2xl font-bold text-center text-white">Iniciar Sesión</h1>
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-white placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-white placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none text-sm" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 px-4 font-semibold rounded-lg bg-lime-400 text-black hover:bg-lime-500 disabled:opacity-50 transition-colors text-sm">
            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </form>
        <p className="text-sm text-center text-zinc-500">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-medium text-lime-400 hover:text-lime-300">Regístrate</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
