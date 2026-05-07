import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebaseClient';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import zypaceLogo from '../assets/zypace_logo_letras.png';

const ForgotPasswordPage = () => {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/user-not-found':  'No existe ninguna cuenta con ese email.',
        'auth/invalid-email':   'Email inválido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
      };
      setError(msg[err.code] || 'Error al enviar el email. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEOHead title="Recuperar contraseña" canonical="/forgot-password" noindex />
      <div className="flex justify-center items-center min-h-screen bg-zinc-950">
        <div className="w-full max-w-md p-8 space-y-6 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl">

          <div className="flex justify-center mb-2">
            <img src={zypaceLogo} alt="Zypace" className="h-9 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          </div>

          {sent ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-lime-950/60 border border-lime-800 flex items-center justify-center">
                <svg className="w-7 h-7 text-lime-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-lg text-zinc-100">Email enviado</p>
                <p className="text-sm text-zinc-500 mt-1">
                  Revisa tu bandeja de entrada en <span className="text-zinc-300">{email}</span>.<br />
                  Si no lo ves, comprueba la carpeta de spam.
                </p>
              </div>
              <Link
                to="/login"
                className="inline-block mt-2 px-6 py-2.5 bg-lime-400 text-black rounded-lg hover:bg-lime-500 font-semibold text-sm transition-colors"
              >
                Volver al login
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold text-center text-white">Recuperar contraseña</h1>
                <p className="text-sm text-zinc-500 text-center mt-1">
                  Te enviaremos un enlace para crear una nueva contraseña.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="tu@email.com"
                    autoFocus
                    className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-white placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none text-sm"
                  />
                </div>

                {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 font-semibold rounded-lg bg-lime-400 text-black hover:bg-lime-500 disabled:opacity-50 transition-colors text-sm"
                >
                  {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
                </button>
              </form>

              <p className="text-sm text-center text-zinc-500">
                <Link to="/login" className="font-medium text-lime-400 hover:text-lime-300 transition-colors">
                  ← Volver al login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
