import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
// Strava assets (oficiales de la guía)
import connectWithStrava from '../assets/1.1 Connect with Strava Buttons/Connect with Strava Orange/btn_strava_connect_with_orange_x2.svg';
import compatibleWithStrava from '../assets/1.2-Strava-API-Logos/Compatible with Strava/cptblWith_strava_white/api_logo_cptblWith_strava_horiz_white.svg';

interface ZoneProfile {
  z1_pace_sec_km: number | null;
  z4_pace_sec_km: number | null;
  z5_pace_sec_km: number | null;
  estimated_5k_sec: number | null;
  estimated_10k_sec: number | null;
  zones_confidence: 'alta' | 'media' | 'baja' | null;
  zones_activities: number | null;
  zones_calibrated_at: string | null;
  zones_source?: 'manual' | 'strava' | null;
}

function secKmToDisplay(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}/km`;
}

function totalSecToDisplay(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
  return `hace ${Math.floor(days / 30)} meses`;
}

interface RunnerProfile {
  experience_level: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  age_range: string;
  current_weekly_km: number;
  longest_recent_run_km: number;
  max_session_minutes: number;
  preferred_training_time: 'morning' | 'afternoon' | 'evening' | 'any';
  has_recent_injury: boolean;
  recent_injury_detail: string;
  injury_areas: string[];
  updated_at: string | null;
}

const INJURY_AREA_OPTIONS = [
  'Rodilla', 'Gemelo/Sóleo', 'Tendón de Aquiles', 'Fascitis plantar',
  'Banda iliotibial (IT band)', 'Cadera/Glúteo', 'Espalda lumbar',
  'Tobillo', 'Tibial anterior (periostitis)', 'Sin lesiones conocidas',
];

const DEFAULT_PROFILE: RunnerProfile = {
  experience_level: 'intermediate',
  age_range: '30-39',
  current_weekly_km: 30,
  longest_recent_run_km: 12,
  max_session_minutes: 90,
  preferred_training_time: 'any',
  has_recent_injury: false,
  recent_injury_detail: '',
  injury_areas: [],
  updated_at: null,
};

const SettingsPage = () => {
  const { user } = useAuth();
  const [isStravaConnected, setIsStravaConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Runner profile state
  const [runnerProfile, setRunnerProfile] = useState<RunnerProfile>(DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Zone calibration state
  const [zoneProfile, setZoneProfile] = useState<ZoneProfile | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationMsg, setCalibrationMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  // Manual calibration inputs
  const [manualDistKm, setManualDistKm] = useState<string>('10');
  const [manualTime, setManualTime] = useState<string>('');
  const [showManualForm, setShowManualForm] = useState(false);

  const verifyStravaConnection = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const tokenSnap = await getDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));

      if (!tokenSnap.exists()) { setIsStravaConnected(false); return; }

      const tokenData = tokenSnap.data();
      const response = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (response.ok) {
        setIsStravaConnected(true);
      } else {
        await deleteDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
        setIsStravaConnected(false);
      }
    } catch {
      setIsStravaConnected(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadUserDoc = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const d = snap.data();
      setZoneProfile({
        z1_pace_sec_km:    d.z1_pace_sec_km    ?? null,
        z4_pace_sec_km:    d.z4_pace_sec_km    ?? null,
        z5_pace_sec_km:    d.z5_pace_sec_km    ?? null,
        estimated_5k_sec:  d.estimated_5k_sec  ?? null,
        estimated_10k_sec: d.estimated_10k_sec ?? null,
        zones_confidence:  d.zones_confidence  ?? null,
        zones_activities:  d.zones_activities  ?? null,
        zones_calibrated_at: d.zones_calibrated_at ?? null,
        zones_source:      d.zones_source ?? null,
      });
      if (d.runner_experience_level) {
        setRunnerProfile({
          experience_level:        d.runner_experience_level        ?? DEFAULT_PROFILE.experience_level,
          age_range:               d.runner_age_range               ?? DEFAULT_PROFILE.age_range,
          current_weekly_km:       Number(d.runner_current_weekly_km)     || DEFAULT_PROFILE.current_weekly_km,
          longest_recent_run_km:   Number(d.runner_longest_recent_run_km) || DEFAULT_PROFILE.longest_recent_run_km,
          max_session_minutes:     Number(d.runner_max_session_minutes)   || DEFAULT_PROFILE.max_session_minutes,
          preferred_training_time: d.runner_preferred_training_time ?? DEFAULT_PROFILE.preferred_training_time,
          has_recent_injury:       d.runner_has_recent_injury       ?? false,
          recent_injury_detail:    d.runner_recent_injury_detail    ?? '',
          injury_areas:            Array.isArray(d.runner_injury_areas) ? d.runner_injury_areas : [],
          updated_at:              d.runner_profile_updated_at?.toDate?.().toISOString() ?? null,
        });
        setProfileLoaded(true);
      }
    }
  }, [user]);

  useEffect(() => {
    verifyStravaConnection();
    loadUserDoc();
  }, [verifyStravaConnection, loadUserDoc]);

  const authUrl = useMemo(() => {
    const clientId   = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = `${window.location.origin}/strava-callback`;
    const scope      = 'read,activity:read,activity:read_all';
    return `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=force&scope=${encodeURIComponent(scope)}`;
  }, []);

  const handleConnectToStrava = () => {
    const popup = window.open(authUrl, 'stravaAuth', 'width=600,height=700');
    const interval = setInterval(() => {
      if (popup && popup.closed) { clearInterval(interval); verifyStravaConnection(); }
    }, 1000);
  };

  const handleDisconnectFromStrava = async () => {
    if (!user) return;
    try {
      const tokenSnap = await getDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
      if (tokenSnap.exists()) {
        const { access_token } = tokenSnap.data();
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}` },
        });
      }
    } catch { /* silencioso */ } finally {
      await deleteDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
      setIsStravaConnected(false);
    }
  };

  function parseTimeToSeconds(input: string): number | null {
    if (!input) return null;
    const parts = input.trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  const handleCalibrateManual = async () => {
    const km = parseFloat(manualDistKm);
    const sec = parseTimeToSeconds(manualTime);
    if (!km || km <= 0 || !sec || sec <= 0) {
      setCalibrationMsg({ type: 'error', text: 'Introduce una distancia y tiempo válidos (ej: 10km en 52:30).' });
      return;
    }
    setCalibrating(true);
    setCalibrationMsg(null);
    try {
      const calibrateZonesFn = httpsCallable(functions, 'calibrateZones');
      const result = await calibrateZonesFn({ manual_race_km: km, manual_race_sec: sec });
      const data = result.data as any;
      if (!data.success) {
        setCalibrationMsg({ type: 'error', text: data.message || 'Error al calibrar.' });
        return;
      }
      await loadUserDoc();
      setCalibrationMsg({ type: 'success', text: `Zonas calibradas desde tu marca de ${km}km. Confianza: alta.` });
      setShowManualForm(false);
    } catch (e: unknown) {
      setCalibrationMsg({ type: 'error', text: e instanceof Error ? e.message : 'Error desconocido' });
    } finally {
      setCalibrating(false);
    }
  };

  const handleCalibrateZones = async () => {
    setCalibrating(true);
    setCalibrationMsg(null);
    try {
      const calibrateZones = httpsCallable(functions, 'calibrateZones');
      const result = await calibrateZones({});
      const data = result.data as any;
      if (!data.success) {
        setCalibrationMsg({ type: 'info', text: data.message || 'No hay suficientes datos.' });
        return;
      }
      await loadUserDoc();
      setCalibrationMsg({
        type: 'success',
        text: `Zonas calibradas desde ${data.activities_analyzed} actividades. Confianza: ${data.confidence}.`,
      });
    } catch (e: unknown) {
      setCalibrationMsg({ type: 'error', text: e instanceof Error ? e.message : 'Error desconocido' });
    } finally {
      setCalibrating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        runner_experience_level:        runnerProfile.experience_level,
        runner_age_range:               runnerProfile.age_range,
        runner_current_weekly_km:       runnerProfile.current_weekly_km,
        runner_longest_recent_run_km:   runnerProfile.longest_recent_run_km,
        runner_max_session_minutes:     runnerProfile.max_session_minutes,
        runner_preferred_training_time: runnerProfile.preferred_training_time,
        runner_has_recent_injury:       runnerProfile.has_recent_injury,
        runner_recent_injury_detail:    runnerProfile.has_recent_injury ? runnerProfile.recent_injury_detail : null,
        runner_injury_areas:            runnerProfile.injury_areas,
        runner_profile_updated_at:      new Date(),
      }, { merge: true });
      setProfileLoaded(true);
      setProfileMsg({ type: 'success', text: 'Perfil guardado. Se usará en todos tus próximos planes.' });
    } catch {
      setProfileMsg({ type: 'error', text: 'Error al guardar el perfil.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const hasZones = zoneProfile?.z1_pace_sec_km && zoneProfile?.z4_pace_sec_km && zoneProfile?.z5_pace_sec_km;
  const confidenceColor = {
    alta:  'text-green-700 bg-green-100',
    media: 'text-yellow-700 bg-yellow-100',
    baja:  'text-red-700 bg-red-100',
  };

  return (
    <main className="container mx-auto p-8 space-y-8">
      <h1 className="text-4xl font-bold text-zinc-100">Ajustes</h1>

      {/* ── Integración Strava ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-zinc-100 mb-4">Integraciones</h2>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={compatibleWithStrava} alt="Compatible with Strava" className="h-6 w-auto" />
            <p className="text-sm sm:text-base font-medium text-zinc-200">
              {isStravaConnected ? 'Conectado a Strava' : 'Conecta tu cuenta de Strava para sincronizar actividades.'}
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : isStravaConnected ? (
            <button onClick={handleDisconnectFromStrava} className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors">
              Desconectar
            </button>
          ) : (
            <>
              <button onClick={handleConnectToStrava} className="p-0 bg-transparent border-0" aria-label="Connect with Strava">
                <img src={connectWithStrava} alt="Connect with Strava" style={{ height: 48 }} />
              </button>
              <a href={authUrl} target="_blank" rel="noopener noreferrer" className="sr-only">Connect with Strava</a>
            </>
          )}
        </div>
      </div>

      {/* ── Perfil de Rendimiento / Zonas ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Perfil de Rendimiento</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Tus zonas de entrenamiento personalizadas, calculadas desde tus actividades reales de Strava.
              Se usan automáticamente al generar planes cuando no tienes un tiempo objetivo definido.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCalibrateZones}
              disabled={calibrating || !isStravaConnected}
              title={!isStravaConnected ? 'Conecta Strava primero' : undefined}
              className="flex-shrink-0 px-4 py-2 bg-lime-400 hover:bg-lime-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {calibrating ? 'Calculando…' : hasZones ? 'Recalibrar desde Strava' : 'Calibrar desde Strava'}
            </button>
            <button
              onClick={() => setShowManualForm(s => !s)}
              disabled={calibrating}
              className="flex-shrink-0 px-4 py-2 bg-zinc-900 border border-zinc-700 hover:border-lime-400 text-zinc-200 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Introducir marca personal
            </button>
          </div>
        </div>

        {/* Manual calibration form */}
        {showManualForm && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-semibold text-blue-800 mb-1">Calibrar desde marca personal</p>
            <p className="text-xs text-blue-700 mb-3">Introduce tu mejor marca reciente en una carrera o test. Es más preciso que el análisis de entrenamientos.</p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Distancia</label>
                <select value={manualDistKm} onChange={e => setManualDistKm(e.target.value)}
                  className="p-2 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 text-sm">
                  <option value="5">5 km</option>
                  <option value="10">10 km</option>
                  <option value="15">15 km</option>
                  <option value="21.0975">Media maratón</option>
                  <option value="42.195">Maratón</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tiempo (MM:SS o H:MM:SS)</label>
                <input type="text" placeholder="52:30" value={manualTime} onChange={e => setManualTime(e.target.value)}
                  className="w-32 p-2 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 text-sm placeholder-gray-400" />
              </div>
              <button
                onClick={handleCalibrateManual}
                disabled={calibrating || !manualTime}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {calibrating ? 'Calculando…' : 'Calibrar zonas'}
              </button>
            </div>
          </div>
        )}

        {!isStravaConnected && !showManualForm && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-400 mb-4">
            Conecta Strava para calibrar automáticamente, o introduce una marca personal con el botón de arriba.
          </div>
        )}

        {calibrationMsg && (
          <div className={`rounded-lg px-4 py-3 text-sm mb-4 ${
            calibrationMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
            calibrationMsg.type === 'error'   ? 'bg-red-50 border border-red-200 text-red-700' :
                                                'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>
            {calibrationMsg.text}
          </div>
        )}

        {hasZones && zoneProfile ? (
          <>
            {/* Header de calibración */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {zoneProfile.zones_confidence && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${confidenceColor[zoneProfile.zones_confidence]}`}>
                  Confianza {zoneProfile.zones_confidence}
                </span>
              )}
              {zoneProfile.zones_source === 'manual' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Desde marca personal
                </span>
              )}
              {zoneProfile.zones_source === 'strava' && zoneProfile.zones_activities && (
                <span className="text-xs text-zinc-500">
                  {zoneProfile.zones_activities} actividades analizadas
                </span>
              )}
              {zoneProfile.zones_calibrated_at && (
                <span className="text-xs text-zinc-600">
                  Calibrado {timeAgo(zoneProfile.zones_calibrated_at)}
                </span>
              )}
            </div>

            {/* Zonas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <ZoneCard
                zone="Z1"
                label="Fácil / Aeróbico"
                pace={secKmToDisplay(zoneProfile.z1_pace_sec_km!)}
                description="Ritmo conversacional. La base de todo tu entrenamiento (80% del volumen)."
                color="green"
              />
              <ZoneCard
                zone="Z4"
                label="Umbral / LT2"
                pace={secKmToDisplay(zoneProfile.z4_pace_sec_km!)}
                description="Ritmo 10k aprox. Sesiones de umbral (método noruego) o tempo (polarizado)."
                color="yellow"
              />
              <ZoneCard
                zone="Z5"
                label="VO2max"
                pace={secKmToDisplay(zoneProfile.z5_pace_sec_km!)}
                description="Ritmo 5k aprox. Sesiones de intervalos (polarizado, 20% del volumen)."
                color="red"
              />
            </div>

            {/* Tiempos estimados */}
            {(zoneProfile.estimated_5k_sec || zoneProfile.estimated_10k_sec) && (
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Marcas estimadas de tu forma actual</p>
                <div className="flex flex-wrap gap-4">
                  {zoneProfile.estimated_5k_sec && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">5 km</span>
                      <span className="font-mono font-bold text-zinc-100 text-lg">
                        {totalSecToDisplay(zoneProfile.estimated_5k_sec)}
                      </span>
                    </div>
                  )}
                  {zoneProfile.estimated_10k_sec && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">10 km</span>
                      <span className="font-mono font-bold text-zinc-100 text-lg">
                        {totalSecToDisplay(zoneProfile.estimated_10k_sec)}
                      </span>
                    </div>
                  )}
                  {zoneProfile.estimated_10k_sec && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Media maratón (estimado)</span>
                      <span className="font-mono font-bold text-zinc-100 text-lg">
                        {totalSecToDisplay(Math.round(zoneProfile.estimated_10k_sec * Math.pow(21.0975 / 10, 1.06)))}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mt-2">
                  Estimaciones basadas en tus mejores esfuerzos recientes. No son marcas oficiales.
                </p>
              </div>
            )}
          </>
        ) : (
          isStravaConnected && !calibrating && (
            <div className="text-center py-8 text-zinc-600">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-medium text-zinc-400">Sin zonas calibradas</p>
              <p className="text-sm mt-1">
                Pulsa "Calibrar zonas desde Strava" para analizar tus actividades y obtener ritmos personalizados.
              </p>
            </div>
          )
        )}
      </div>
      {/* ── Perfil de Corredor ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-5">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Perfil de Corredor</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Tu perfil se usa para personalizar todos los planes y adaptar la carga a tu nivel real.
              {runnerProfile.updated_at && (
                <span className="ml-2 text-zinc-600">Actualizado {timeAgo(runnerProfile.updated_at)}</span>
              )}
            </p>
          </div>
          {!profileLoaded && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              Sin perfil guardado — se usarán los valores por defecto
            </span>
          )}
        </div>

        <div className="space-y-6">
          {/* Nivel y edad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-zinc-200 mb-2">Nivel de experiencia</label>
              <div className="flex flex-wrap gap-2">
                {([['beginner','Principiante'],['intermediate','Intermedio'],['advanced','Avanzado'],['elite','Élite']] as const).map(([v, label]) => (
                  <button key={v} type="button"
                    onClick={() => setRunnerProfile(p => ({ ...p, experience_level: v }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${runnerProfile.experience_level === v ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-lime-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-zinc-200 mb-2">Rango de edad</label>
              <select value={runnerProfile.age_range}
                onChange={e => setRunnerProfile(p => ({ ...p, age_range: e.target.value }))}
                className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 text-sm">
                {['18-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60+'].map(r => (
                  <option key={r} value={r}>{r} años</option>
                ))}
              </select>
            </div>
          </div>

          {/* Volumen y rodaje largo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-zinc-200 mb-2">
                Km semanales actuales: <span className="text-lime-500 font-bold">{runnerProfile.current_weekly_km} km</span>
              </label>
              <input type="range" min={10} max={150} step={5}
                value={runnerProfile.current_weekly_km}
                onChange={e => setRunnerProfile(p => ({ ...p, current_weekly_km: Number(e.target.value) }))}
                className="w-full accent-orange-500" />
              <div className="flex justify-between text-xs text-zinc-600 mt-1"><span>10</span><span>150 km</span></div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-zinc-200 mb-2">
                Rodaje largo reciente: <span className="text-lime-500 font-bold">{runnerProfile.longest_recent_run_km} km</span>
              </label>
              <input type="range" min={5} max={42} step={1}
                value={runnerProfile.longest_recent_run_km}
                onChange={e => setRunnerProfile(p => ({ ...p, longest_recent_run_km: Number(e.target.value) }))}
                className="w-full accent-orange-500" />
              <div className="flex justify-between text-xs text-zinc-600 mt-1"><span>5</span><span>42 km</span></div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-zinc-200 mb-2">
                Tiempo máximo/sesión: <span className="text-lime-500 font-bold">{runnerProfile.max_session_minutes} min</span>
              </label>
              <input type="range" min={30} max={240} step={10}
                value={runnerProfile.max_session_minutes}
                onChange={e => setRunnerProfile(p => ({ ...p, max_session_minutes: Number(e.target.value) }))}
                className="w-full accent-orange-500" />
              <div className="flex justify-between text-xs text-zinc-600 mt-1"><span>30</span><span>240 min</span></div>
            </div>
          </div>

          {/* Momento preferido */}
          <div>
            <label className="block text-sm font-semibold text-zinc-200 mb-2">Momento de entrenamiento preferido</label>
            <div className="flex flex-wrap gap-2">
              {([['morning','Mañana'],['afternoon','Tarde'],['evening','Noche'],['any','Flexible']] as const).map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => setRunnerProfile(p => ({ ...p, preferred_training_time: v }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${runnerProfile.preferred_training_time === v ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-lime-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Lesiones crónicas */}
          <div>
            <label className="block text-sm font-semibold text-zinc-200 mb-2">Zonas de lesión crónica o historial</label>
            <div className="flex flex-wrap gap-2">
              {INJURY_AREA_OPTIONS.map(area => (
                <button key={area} type="button"
                  onClick={() => setRunnerProfile(p => ({
                    ...p,
                    injury_areas: p.injury_areas.includes(area)
                      ? p.injury_areas.filter(a => a !== area)
                      : [...p.injury_areas.filter(a => a !== 'Sin lesiones conocidas'), area],
                  }))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    runnerProfile.injury_areas.includes(area)
                      ? area === 'Sin lesiones conocidas' ? 'bg-green-100 border-green-400 text-green-800' : 'bg-red-100 border-red-400 text-red-800'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-gray-400'
                  }`}>
                  {area}
                </button>
              ))}
            </div>
          </div>

          {/* Lesión reciente */}
          <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/50">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-semibold text-zinc-100">¿Tienes alguna lesión reciente activa?</span>
              <button type="button"
                onClick={() => setRunnerProfile(p => ({ ...p, has_recent_injury: !p.has_recent_injury }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${runnerProfile.has_recent_injury ? 'bg-lime-400' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${runnerProfile.has_recent_injury ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {runnerProfile.has_recent_injury && (
              <input type="text" placeholder="Describe brevemente la lesión (ej: dolor rodilla derecha 2 semanas)"
                value={runnerProfile.recent_injury_detail}
                onChange={e => setRunnerProfile(p => ({ ...p, recent_injury_detail: e.target.value }))}
                className="w-full p-2.5 border border-amber-300 rounded-lg bg-zinc-900 text-zinc-100 text-sm placeholder-gray-400" />
            )}
          </div>

          {/* Feedback message */}
          {profileMsg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${profileMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {profileMsg.text}
            </div>
          )}

          <button onClick={handleSaveProfile} disabled={savingProfile}
            className="w-full sm:w-auto px-6 py-2.5 bg-lime-400 hover:bg-lime-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            {savingProfile ? 'Guardando…' : 'Guardar perfil de corredor'}
          </button>
        </div>
      </div>
    </main>
  );
};

// ── Zone card sub-component ──────────────────────────────────

type ZoneColor = 'green' | 'yellow' | 'red';

function ZoneCard({ zone, label, pace, description, color }: {
  zone: string; label: string; pace: string; description: string; color: ZoneColor;
}) {
  const colors: Record<ZoneColor, { bg: string; border: string; badge: string; paceText: string }> = {
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-200 text-green-900',  paceText: 'text-green-800'  },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-200 text-yellow-900', paceText: 'text-yellow-800' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-200 text-red-900',      paceText: 'text-red-800'    },
  };
  const c = colors[color];
  return (
    <div className={`rounded-xl border p-4 ${c.bg} ${c.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>{zone}</span>
        <span className="text-sm font-semibold text-zinc-200">{label}</span>
      </div>
      <div className={`text-2xl font-mono font-bold ${c.paceText} mb-1`}>{pace}</div>
      <p className="text-xs text-zinc-500">{description}</p>
    </div>
  );
}

export default SettingsPage;
