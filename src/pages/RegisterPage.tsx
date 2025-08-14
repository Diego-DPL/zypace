import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

interface ProfileForm {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  country: string;
  experience_level: string;
  primary_goal: string;
  last_10k_time: string; // mm:ss
  availability_days: Record<string, boolean>;
  accepted_terms: boolean;
}

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>({
    first_name: '',
    last_name: '',
    birth_date: '',
    gender: '',
    country: '',
    experience_level: 'beginner',
    primary_goal: '',
    last_10k_time: '',
    availability_days: { mon:false, tue:false, wed:false, thu:false, fri:false, sat:false, sun:false },
    accepted_terms: false,
  });

  const toggleDay = (d:string) => setProfile(p=> ({...p, availability_days: { ...p.availability_days, [d]: !p.availability_days[d] }}));

  const parse10k = (v:string): number | null => {
    if(!v) return null;
    const parts = v.split(':');
    if(parts.length!==2) return null;
    const m = parseInt(parts[0],10); const s=parseInt(parts[1],10);
    if(Number.isNaN(m)||Number.isNaN(s)) return null;
    return m*60+s;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      // Validaciones mínimas
      if (!profile.accepted_terms) {
        throw new Error('Debes aceptar los términos y condiciones');
      }
      if (profile.birth_date) {
        const bd = new Date(profile.birth_date);
        if (bd > new Date()) throw new Error('Fecha de nacimiento inválida');
      }
      const { data, error: signErr } = await supabase.auth.signUp({ email, password });
      if (signErr) throw signErr;
      const userId = data.user?.id;
      if (userId) {
        const availability = Object.entries(profile.availability_days).filter(([,v])=>v).map(([k])=>k);
        const last10k = parse10k(profile.last_10k_time);
        const { error: profErr } = await supabase.from('profiles').insert({
          user_id: userId,
          first_name: profile.first_name || null,
            last_name: profile.last_name || null,
          birth_date: profile.birth_date || null,
          gender: profile.gender || null,
          country: profile.country || null,
          experience_level: profile.experience_level || null,
          primary_goal: profile.primary_goal || null,
          last_10k_time_sec: last10k,
          availability_days: availability.length? availability : null,
          accepted_terms: profile.accepted_terms,
          terms_version: 'v1',
          accepted_terms_at: new Date().toISOString(),
        });
        if (profErr) throw profErr;
      }
      setSuccess(true);
    } catch (error: any) {
      setError(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-start py-10 bg-gradient-to-br from-orange-50 via-white to-rose-50">
      <div className="w-full max-w-3xl p-8 space-y-8 bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-white/50">
        <h1 className="text-3xl font-extrabold text-center bg-gradient-to-r from-orange-600 via-pink-600 to-purple-600 text-transparent bg-clip-text">Crear Cuenta</h1>
        {success ? (
          <div className="text-center text-green-600">
            <p>¡Registro exitoso!</p>
            <p>Por favor, revisa tu correo para verificar tu cuenta.</p>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-10">
            <fieldset className="grid md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Acceso</h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Email</label>
                <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Contraseña</label>
                <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
            </fieldset>

            <fieldset className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-3"><h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Perfil</h2></div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Nombre</label>
                <input value={profile.first_name} onChange={e=>setProfile(p=>({...p, first_name:e.target.value}))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Apellidos</label>
                <input value={profile.last_name} onChange={e=>setProfile(p=>({...p, last_name:e.target.value}))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Fecha nacimiento</label>
                <input type="date" value={profile.birth_date} onChange={e=>setProfile(p=>({...p, birth_date:e.target.value}))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Género</label>
                <select value={profile.gender} onChange={e=>setProfile(p=>({...p, gender:e.target.value}))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:ring-orange-500 focus:border-orange-500">
                  <option value="">-</option>
                  <option value="male">Masculino</option>
                  <option value="female">Femenino</option>
                  <option value="other">Otro</option>
                  <option value="prefer_not">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">País</label>
                <input value={profile.country} onChange={e=>setProfile(p=>({...p, country:e.target.value}))} placeholder="España" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Nivel</label>
                <select value={profile.experience_level} onChange={e=>setProfile(p=>({...p, experience_level:e.target.value}))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:ring-orange-500 focus:border-orange-500">
                  <option value="beginner">Principiante</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzado">Avanzado</option>
                  <option value="elite">Élite</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600">Objetivo principal</label>
                <input value={profile.primary_goal} onChange={e=>setProfile(p=>({...p, primary_goal:e.target.value}))} placeholder="Acabar mi primer 10K, bajar de 45', etc" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Marca 10K (mm:ss)</label>
                <input value={profile.last_10k_time} onChange={e=>setProfile(p=>({...p, last_10k_time:e.target.value}))} placeholder="45:30" pattern="^[0-9]{1,2}:[0-5][0-9]$" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500" />
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Disponibilidad semanal</h2>
              <div className="grid grid-cols-7 gap-2 text-center">
                {( ['mon','tue','wed','thu','fri','sat','sun'] as string[] ).map(day => (
                  <button type="button" key={day} onClick={()=>toggleDay(day)} className={`py-2 rounded-md text-[11px] font-medium border transition ${profile.availability_days[day] ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{day.substring(0,3).toUpperCase()}</button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">Esto nos ayuda a generar planes realistas más adelante.</p>
            </fieldset>

            <fieldset className="space-y-4">
              <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Términos</h2>
              <div className="flex items-start gap-3">
                <input id="terms" type="checkbox" checked={profile.accepted_terms} onChange={e=>setProfile(p=>({...p, accepted_terms:e.target.checked}))} className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500" required />
                <label htmlFor="terms" className="text-xs text-gray-600">Acepto los <button type="button" onClick={()=>setShowTerms(true)} className="underline text-orange-600 hover:text-orange-700">términos y condiciones</button>.</label>
              </div>
            </fieldset>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 px-4 text-sm font-semibold tracking-wide text-white rounded-md bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50">
              {loading ? 'Registrando...' : 'Crear cuenta'}
            </button>
          </form>
        )}
        <p className="text-sm text-center text-gray-600">
          ¿Ya tienes una cuenta? <Link to="/login" className="font-medium text-blue-600 hover:underline">Inicia Sesión</Link>
        </p>
        {showTerms && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white max-w-lg w-full rounded-xl shadow-xl p-6 space-y-4 relative">
              <h3 className="text-lg font-semibold text-gray-800">Términos y Condiciones (v1)</h3>
              <div className="h-60 overflow-y-auto pr-2 text-xs leading-relaxed text-gray-600 space-y-3">
                <p><strong>Uso del servicio:</strong> Esta plataforma se ofrece para gestionar tus planes y actividades de entrenamiento personal. No constituye asesoramiento médico.</p>
                <p><strong>Privacidad:</strong> Al registrarte aceptas el procesamiento de tus datos para personalizar tu experiencia. Podrás solicitar la eliminación de tu cuenta.</p>
                <p><strong>Responsabilidad:</strong> Debes adaptar el entrenamiento a tu condición física. Consulta con un profesional de la salud antes de iniciar un plan exigente.</p>
                <p><strong>Datos de terceros:</strong> La sincronización con Strava implica la importación de datos deportivos. Puedes revocar el acceso en cualquier momento.</p>
                <p><strong>Modificaciones:</strong> Podemos actualizar estos términos. Te notificaremos si hay cambios sustanciales. Continuar usando el servicio implica aceptación.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={()=>setShowTerms(false)} className="px-4 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50">Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;
