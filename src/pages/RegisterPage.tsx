import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebaseClient';
import { Link } from 'react-router-dom';

interface ProfileForm {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  country: string;
  experience_level: string;
  primary_goal: string;
  last_10k_time: string;
  availability_days: Record<string, boolean>;
  accepted_terms: boolean;
}

const RegisterPage = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [profile, setProfile]   = useState<ProfileForm>({
    first_name: '', last_name: '', birth_date: '', gender: '',
    country: '', experience_level: 'beginner', primary_goal: '',
    last_10k_time: '',
    availability_days: { mon:false, tue:false, wed:false, thu:false, fri:false, sat:false, sun:false },
    accepted_terms: false,
  });

  const toggleDay = (d: string) =>
    setProfile(p => ({ ...p, availability_days: { ...p.availability_days, [d]: !p.availability_days[d] } }));

  const parse10k = (v: string): number | null => {
    if (!v) return null;
    const [m, s] = v.split(':').map(Number);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.accepted_terms) { setError('Debes aceptar los términos y condiciones'); return; }
    setLoading(true);
    setError(null);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      const availability = Object.entries(profile.availability_days).filter(([,v]) => v).map(([k]) => k);
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        first_name:        profile.first_name   || null,
        last_name:         profile.last_name    || null,
        birth_date:        profile.birth_date   || null,
        gender:            profile.gender       || null,
        country:           profile.country      || null,
        experience_level:  profile.experience_level || null,
        primary_goal:      profile.primary_goal || null,
        last_10k_time_sec: parse10k(profile.last_10k_time),
        availability_days: availability.length ? availability : null,
        accepted_terms:    true,
        terms_version:     'v1',
        accepted_terms_at: new Date().toISOString(),
        created_at:        serverTimestamp(),
      });
      setSuccess(true);
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/email-already-in-use': 'Ya existe una cuenta con este email.',
        'auth/weak-password':        'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-email':        'Email inválido.',
      };
      setError(msg[err.code] || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-start py-10 bg-gradient-to-br from-orange-50 via-white to-rose-50">
      <div className="w-full max-w-3xl p-8 space-y-8 bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-white/50">
        <h1 className="text-3xl font-extrabold text-center bg-gradient-to-r from-lime-500 via-pink-600 to-purple-600 text-transparent bg-clip-text">
          Crear Cuenta
        </h1>

        {success ? (
          <div className="text-center text-green-600 space-y-2">
            <p className="font-semibold text-lg">¡Registro exitoso!</p>
            <p>Ya puedes iniciar sesión con tu cuenta.</p>
            <Link to="/login" className="inline-block mt-4 px-6 py-2 bg-lime-400 text-white rounded-lg hover:bg-lime-500 font-semibold">
              Ir al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-10">
            {/* Acceso */}
            <fieldset className="grid md:grid-cols-2 gap-6">
              <div className="md:col-span-2"><h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Acceso</h2></div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
              </div>
            </fieldset>

            {/* Perfil */}
            <fieldset className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-3"><h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Perfil</h2></div>
              {[['Nombre','first_name'],['Apellidos','last_name']].map(([label, field]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600">{label}</label>
                  <input value={(profile as any)[field]} onChange={e => setProfile(p => ({...p, [field]: e.target.value}))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600">Fecha nacimiento</label>
                <input type="date" value={profile.birth_date} onChange={e => setProfile(p => ({...p, birth_date: e.target.value}))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Género</label>
                <select value={profile.gender} onChange={e => setProfile(p => ({...p, gender: e.target.value}))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900">
                  <option value="">-</option>
                  <option value="male">Masculino</option>
                  <option value="female">Femenino</option>
                  <option value="other">Otro</option>
                  <option value="prefer_not">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">País</label>
                <input value={profile.country} onChange={e => setProfile(p => ({...p, country: e.target.value}))} placeholder="España"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Nivel</label>
                <select value={profile.experience_level} onChange={e => setProfile(p => ({...p, experience_level: e.target.value}))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900">
                  <option value="beginner">Principiante</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzado">Avanzado</option>
                  <option value="elite">Élite</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600">Objetivo principal</label>
                <input value={profile.primary_goal} onChange={e => setProfile(p => ({...p, primary_goal: e.target.value}))}
                  placeholder="Acabar mi primer 10K, bajar de 45', etc"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Marca 10K (mm:ss)</label>
                <input value={profile.last_10k_time} onChange={e => setProfile(p => ({...p, last_10k_time: e.target.value}))}
                  placeholder="45:30" pattern="^[0-9]{1,2}:[0-5][0-9]$"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900" />
              </div>
            </fieldset>

            {/* Disponibilidad */}
            <fieldset className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Disponibilidad semanal</h2>
              <div className="grid grid-cols-7 gap-2 text-center">
                {(['mon','tue','wed','thu','fri','sat','sun'] as string[]).map(day => (
                  <button type="button" key={day} onClick={() => toggleDay(day)}
                    className={`py-2 rounded-md text-[11px] font-medium border transition ${profile.availability_days[day] ? 'bg-lime-400 text-white border-lime-400' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {day.slice(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Términos */}
            <fieldset className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Términos</h2>
              <div className="flex items-start gap-3">
                <input id="terms" type="checkbox" checked={profile.accepted_terms}
                  onChange={e => setProfile(p => ({...p, accepted_terms: e.target.checked}))}
                  className="mt-1 h-4 w-4 text-lime-600 border-gray-300 rounded" required />
                <label htmlFor="terms" className="text-xs text-gray-600">
                  Acepto los{' '}
                  <button type="button" onClick={() => setShowTerms(true)} className="underline text-lime-600">
                    términos y condiciones
                  </button>.
                </label>
              </div>
            </fieldset>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 px-4 text-sm font-semibold text-white rounded-md bg-gradient-to-r from-lime-400 via-pink-500 to-purple-600 disabled:opacity-50">
              {loading ? 'Registrando...' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-gray-600">
          ¿Ya tienes cuenta? <Link to="/login" className="font-medium text-blue-600 hover:underline">Inicia Sesión</Link>
        </p>

        {showTerms && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white max-w-lg w-full rounded-xl shadow-xl p-6 space-y-4 relative">
              <h3 className="text-lg font-semibold text-gray-800">Términos y Condiciones (v1)</h3>
              <div className="h-60 overflow-y-auto pr-2 text-xs leading-relaxed text-gray-600 space-y-3">
                <p><strong>Uso:</strong> Plataforma para gestionar planes y actividades de entrenamiento personal. No es asesoramiento médico.</p>
                <p><strong>Privacidad:</strong> Aceptas el procesamiento de datos para personalizar tu experiencia. Puedes solicitar eliminación de cuenta.</p>
                <p><strong>Responsabilidad:</strong> Consulta con un profesional antes de iniciar un plan exigente.</p>
                <p><strong>Strava:</strong> La sincronización importa datos deportivos. Puedes revocar el acceso en cualquier momento.</p>
                <p><strong>Modificaciones:</strong> Podemos actualizar estos términos. Continuar usando el servicio implica aceptación.</p>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowTerms(false)} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;
