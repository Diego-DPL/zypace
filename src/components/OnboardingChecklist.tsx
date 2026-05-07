import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  doc, getDoc, getDocs, collection,
  query, limit, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';

interface Step {
  id:       string;
  label:    string;
  sublabel: string;
  done:     boolean;
  href?:    string;
  action?:  string;
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const [steps,     setSteps]     = useState<Step[]>([]);
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;

    const check = async () => {
      const uid = user.uid;

      // One parallel read for each check
      const [userSnap, racesSnap, plansSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(query(collection(db, 'users', uid, 'races'),          limit(1))),
        getDocs(query(collection(db, 'users', uid, 'training_plans'), limit(1))),
      ]);

      const userData      = userSnap.data() ?? {};
      const stravaConnected = !!userData.strava_athlete_id;
      const hasRace         = !racesSnap.empty;
      const hasPlan         = !plansSnap.empty;
      const isDismissed     = !!userData.onboarding_dismissed;

      setDismissed(isDismissed);
      setSteps([
        {
          id:       'strava',
          label:    'Conecta Strava',
          sublabel: 'Sincroniza tus actividades automáticamente.',
          done:     stravaConnected,
          href:     '/settings',
          action:   'Conectar',
        },
        {
          id:       'race',
          label:    'Añade tu primera carrera',
          sublabel: 'Define tu objetivo y fecha de competición.',
          done:     hasRace,
          href:     '/calendar',
          action:   'Añadir carrera',
        },
        {
          id:       'plan',
          label:    'Genera tu plan de entrenamiento',
          sublabel: 'La IA construye tu preparación semana a semana.',
          done:     hasPlan,
          href:     '/training-plan',
          action:   'Generar plan',
        },
      ]);
      setLoading(false);
    };

    check();
  }, [user]);

  const handleDismiss = async () => {
    if (!user) return;
    setDismissed(true);
    await updateDoc(doc(db, 'users', user.uid), { onboarding_dismissed: true });
  };

  const allDone = steps.length > 0 && steps.every(s => s.done);

  // Hide if dismissed, all done, or still loading
  if (loading || dismissed || allDone) return null;

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-lime-400/40 via-lime-400/10 to-transparent mb-10">
      <div className="rounded-2xl bg-zinc-900/95 p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Empieza aquí</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {doneCount} de {steps.length} pasos completados
            </p>
          </div>
          {/* Progress bar */}
          <div className="flex-1 max-w-32 self-center">
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-lime-400 rounded-full transition-all duration-500"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-zinc-600 hover:text-zinc-400 text-sm leading-none shrink-0 transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Steps */}
        <div className="grid sm:grid-cols-3 gap-3">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`rounded-xl p-4 border transition-colors ${
                step.done
                  ? 'bg-lime-400/5 border-lime-400/20'
                  : 'bg-zinc-800/60 border-zinc-700/50'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                {/* Step indicator */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  step.done
                    ? 'bg-lime-400 text-black'
                    : 'bg-zinc-700 text-zinc-400'
                }`}>
                  {step.done
                    ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : i + 1
                  }
                </div>
                <span className={`text-sm font-semibold ${step.done ? 'text-lime-300' : 'text-zinc-200'}`}>
                  {step.label}
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed mb-3 pl-[34px]">
                {step.sublabel}
              </p>
              {!step.done && step.href && (
                <div className="pl-[34px]">
                  <Link
                    to={step.href}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-lime-400 hover:text-lime-300 transition-colors"
                  >
                    {step.action}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
