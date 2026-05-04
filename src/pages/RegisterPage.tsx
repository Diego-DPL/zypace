import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebaseClient';
import { Link } from 'react-router-dom';
import zypaceLogo from '../assets/zypace_logo_letras.png';

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

  const inputClass = "mt-1 w-full rounded-lg border border-zinc-700 px-3 py-2.5 text-sm bg-zinc-800 text-white placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const selectClass = "mt-1 w-full rounded-lg border border-zinc-700 px-3 py-2.5 text-sm bg-zinc-800 text-white focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const labelClass = "block text-xs font-medium text-zinc-400 mb-0.5";
  const sectionClass = "text-[11px] font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2 before:flex-1 before:h-px before:bg-zinc-800 after:flex-1 after:h-px after:bg-zinc-800";

  return (
    <div className="relative min-h-screen flex justify-center items-start py-10 bg-zinc-950">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_70%_10%,rgba(163,230,53,0.07),transparent_60%)]" />
      <div className="relative w-full max-w-3xl mx-4 p-8 space-y-8 bg-zinc-900 rounded-2xl shadow-xl border border-zinc-800">

        {/* Logo + título */}
        <div className="text-center space-y-3">
          <img src={zypaceLogo} alt="Zypace" className="h-8 w-auto mx-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-2xl font-extrabold text-white">Crear cuenta</h1>
            <p className="text-sm text-zinc-500 mt-1">Empieza a entrenar con inteligencia.</p>
          </div>
        </div>

        {success ? (
          <div className="text-center space-y-3 py-6">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-950/60 border border-green-800 flex items-center justify-center text-2xl">✓</div>
            <p className="font-semibold text-lg text-zinc-100">¡Registro exitoso!</p>
            <p className="text-sm text-zinc-500">Ya puedes iniciar sesión con tu cuenta.</p>
            <Link to="/login" className="inline-block mt-2 px-6 py-2.5 bg-lime-400 text-black rounded-lg hover:bg-lime-500 font-semibold text-sm transition-colors">
              Ir al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-8">

            {/* Acceso */}
            <div className="space-y-4">
              <p className={sectionClass}>Acceso</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="tu@email.com" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contraseña</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                    placeholder="Mínimo 6 caracteres" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Perfil */}
            <div className="space-y-4">
              <p className={sectionClass}>Perfil</p>
              <div className="grid md:grid-cols-3 gap-4">
                {[['Nombre','first_name',''],['Apellidos','last_name','']].map(([label, field, placeholder]) => (
                  <div key={field}>
                    <label className={labelClass}>{label}</label>
                    <input value={(profile as any)[field]} onChange={e => setProfile(p => ({...p, [field]: e.target.value}))}
                      placeholder={placeholder} className={inputClass} />
                  </div>
                ))}
                <div>
                  <label className={labelClass}>Fecha de nacimiento</label>
                  <input type="date" value={profile.birth_date} onChange={e => setProfile(p => ({...p, birth_date: e.target.value}))}
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Género</label>
                  <select value={profile.gender} onChange={e => setProfile(p => ({...p, gender: e.target.value}))}
                    className={selectClass}>
                    <option value="">-</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                    <option value="other">Otro</option>
                    <option value="prefer_not">Prefiero no decir</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>País</label>
                  <input value={profile.country} onChange={e => setProfile(p => ({...p, country: e.target.value}))} placeholder="España"
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nivel</label>
                  <select value={profile.experience_level} onChange={e => setProfile(p => ({...p, experience_level: e.target.value}))}
                    className={selectClass}>
                    <option value="beginner">Principiante</option>
                    <option value="intermedio">Intermedio</option>
                    <option value="avanzado">Avanzado</option>
                    <option value="elite">Élite</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Objetivo principal</label>
                  <input value={profile.primary_goal} onChange={e => setProfile(p => ({...p, primary_goal: e.target.value}))}
                    placeholder="Acabar mi primer 10K, bajar de 45', etc."
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Marca 10K <span className="text-zinc-600 font-normal">(mm:ss)</span></label>
                  <input value={profile.last_10k_time} onChange={e => setProfile(p => ({...p, last_10k_time: e.target.value}))}
                    placeholder="45:30" pattern="^[0-9]{1,2}:[0-5][0-9]$"
                    className={inputClass} />
                </div>
              </div>
            </div>

            {/* Disponibilidad */}
            <div className="space-y-3">
              <p className={sectionClass}>Disponibilidad semanal</p>
              <div className="grid grid-cols-7 gap-2 text-center">
                {([
                  ['mon','L'],['tue','M'],['wed','X'],['thu','J'],['fri','V'],['sat','S'],['sun','D']
                ] as [string,string][]).map(([day, label]) => (
                  <button type="button" key={day} onClick={() => toggleDay(day)}
                    className={`py-2.5 rounded-lg text-xs font-bold border transition-colors ${
                      profile.availability_days[day]
                        ? 'bg-lime-400 text-black border-lime-400'
                        : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Términos */}
            <div className="space-y-3">
              <p className={sectionClass}>Legal</p>
              <div className="flex items-start gap-3">
                <input id="terms" type="checkbox" checked={profile.accepted_terms}
                  onChange={e => setProfile(p => ({...p, accepted_terms: e.target.checked}))}
                  className="mt-0.5 h-4 w-4 accent-lime-400 border-zinc-700 rounded" required />
                <label htmlFor="terms" className="text-xs text-zinc-400 leading-relaxed">
                  He leído y acepto los{' '}
                  <button type="button" onClick={() => setShowTerms(true)} className="underline text-lime-400 hover:text-lime-300">
                    términos y condiciones
                  </button>.
                </label>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 px-4 text-sm font-semibold text-black rounded-lg bg-lime-400 hover:bg-lime-500 disabled:opacity-50 transition-colors shadow-lg shadow-lime-400/10">
              {loading ? 'Registrando...' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-zinc-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-lime-400 hover:text-lime-300 transition-colors">Inicia Sesión</Link>
        </p>

        {showTerms && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-zinc-900 border border-zinc-800 max-w-lg w-full rounded-xl shadow-xl p-6 space-y-4">
              <h3 className="text-lg font-semibold text-zinc-100">Términos y Condiciones (v1)</h3>
              <div className="h-60 overflow-y-auto pr-2 text-xs leading-relaxed text-zinc-400 space-y-3">
                <p><strong className="text-zinc-300">Uso:</strong> Plataforma para gestionar planes y actividades de entrenamiento personal. No es asesoramiento médico.</p>
                <p><strong className="text-zinc-300">Privacidad:</strong> Aceptas el procesamiento de datos para personalizar tu experiencia. Puedes solicitar eliminación de cuenta.</p>
                <p><strong className="text-zinc-300">Responsabilidad:</strong> Consulta con un profesional antes de iniciar un plan exigente.</p>
                <p><strong className="text-zinc-300">Strava:</strong> La sincronización importa datos deportivos. Puedes revocar el acceso en cualquier momento.</p>
                <p><strong className="text-zinc-300">Modificaciones:</strong> Podemos actualizar estos términos. Continuar usando el servicio implica aceptación.</p>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowTerms(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;
