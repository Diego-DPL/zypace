import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection, getDocs, doc, getDoc, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseClient';
import { Race } from './RacesPage';
import WeeklyAnalysis from '../components/WeeklyAnalysis';

interface Workout {
  id: string;
  workout_date: string;
  description: string;
  is_completed: boolean;
  distance_km?: number | null;
  duration_min?: number | null;
  explanation_json?: any;
}

interface TrainingPlan {
  id: string;
  goal: string;
  workouts: Workout[];
  model?: string | null;
  used_fallback?: boolean | null;
  attempts?: number | null;
  openai_error?: string | null;
  // Mesocycle fields
  total_weeks?: number | null;
  mesocycle_number?: number | null;
  mesocycle_length_weeks?: number | null;
  mesocycle_start_date?: string | null;
  mesocycle_end_date?: string | null;
  total_mesocycles?: number | null;
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const TrainingPlanPage = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [goal, setGoal] = useState('');
  const [runDays, setRunDays] = useState<number>(4);
  const [runDaysOfWeek, setRunDaysOfWeek] = useState<number[]>([]); // optional specific days (empty = auto)
  const [includeStrength, setIncludeStrength] = useState<boolean>(false);
  const [strengthDaysCount, setStrengthDaysCount] = useState<number>(2);
  // Strength: specific weekdays (0=Sun..6=Sat)
  const [strengthDaysOfWeek, setStrengthDaysOfWeek] = useState<number[]>([]); // optional (empty = auto)
  const [hasPreviousMark, setHasPreviousMark] = useState<boolean>(false);
  const [lastRaceDistance, setLastRaceDistance] = useState<string>('');
  const [lastRaceTime, setLastRaceTime] = useState<string>('');
  const [targetRaceTime, setTargetRaceTime] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingNextMeso, setLoadingNextMeso] = useState(false);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planMeta, setPlanMeta] = useState<any | null>(null);
  const [profileZones, setProfileZones] = useState<{ z1_sec_km: number; z4_sec_km: number; z5_sec_km: number } | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionPreview, setVersionPreview] = useState<any | null>(null);
  const [methodology, setMethodology] = useState<'polarized' | 'norwegian' | 'classic'>('polarized');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'elite'>('intermediate');
  const [ageRange, setAgeRange] = useState<string>('30-39');
  const [currentWeeklyKm, setCurrentWeeklyKm] = useState<number>(30);
  const [longestRecentRunKm, setLongestRecentRunKm] = useState<number>(12);
  const [maxSessionMinutes, setMaxSessionMinutes] = useState<number>(90);
  const [preferredTrainingTime, setPreferredTrainingTime] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('any');
  const [hasRecentInjury, setHasRecentInjury] = useState<boolean>(false);
  const [recentInjuryDetail, setRecentInjuryDetail] = useState<string>('');
  const [injuryAreas, setInjuryAreas] = useState<string[]>([]);
  const [raceTerrain, setRaceTerrain] = useState<'road' | 'trail' | 'mixed' | 'track'>('road');
  const [racePriority, setRacePriority] = useState<'A' | 'B' | 'C'>('A');
  const [progressModal, setProgressModal] = useState(false);
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);
  const progressMessages = [
    'Analizando tu carrera y objetivo…',
    'Calculando distribución semanal óptima…',
    'Ajustando cargas y descansos…',
    'Seleccionando intensidades adecuadas…',
    'Generando explicaciones de cada sesión…',
    'Casi listo, preparando tu mesociclo…',
  ];
  const [resultModal, setResultModal] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!progressModal) return;
    const id = setInterval(() => {
      setProgressMessageIndex(i => (i + 1) % progressMessages.length);
    }, 2500);
    return () => clearInterval(id);
  }, [progressModal]);

  useEffect(() => {
    if (progressModal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [progressModal]);

  const ProgressPortal = ({ message }: { message: string }) => {
    const content = (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 select-none">
        <div className="bg-white relative rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col items-center text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-100/60 via-white to-white pointer-events-none z-0" />
          <div className="relative z-10 flex flex-col items-center w-full">
            <div className="w-16 h-16 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-orange-200" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-orange-500 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-orange-50 animate-pulse" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Generando mesociclo</h3>
            <p className="text-sm text-gray-700 font-medium min-h-[44px] leading-relaxed transition-opacity duration-700 px-1">{message}</p>
            <p className="mt-3 text-[11px] text-gray-500">Puede tardar un momento. No cierres esta pestaña.</p>
          </div>
        </div>
      </div>
    );
    try { return createPortal(content, document.body); }
    catch { return content; }
  };

  function parseTimeToSeconds(input: string): number | null {
    if (!input) return null;
    const parts = input.trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  }

  useEffect(() => {
    if (!user) return;
    const fetchRaces = async () => {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'races'), orderBy('date', 'asc')));
      setRaces(snap.docs.map(d => ({ id: d.id, ...d.data() } as Race)));
      // Pre-select race from URL param (e.g. coming from /calendar)
      const raceFromUrl = searchParams.get('race');
      if (raceFromUrl) setSelectedRace(raceFromUrl);
    };
    const fetchUserProfile = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        if (d.z1_pace_sec_km && d.z4_pace_sec_km && d.z5_pace_sec_km) {
          setProfileZones({ z1_sec_km: d.z1_pace_sec_km, z4_sec_km: d.z4_pace_sec_km, z5_sec_km: d.z5_pace_sec_km });
        }
        // Pre-populate runner profile fields saved from previous plan generations
        if (d.runner_experience_level)        setExperienceLevel(d.runner_experience_level);
        if (d.runner_age_range)               setAgeRange(d.runner_age_range);
        if (d.runner_current_weekly_km)       setCurrentWeeklyKm(Number(d.runner_current_weekly_km));
        if (d.runner_longest_recent_run_km)   setLongestRecentRunKm(Number(d.runner_longest_recent_run_km));
        if (d.runner_max_session_minutes)     setMaxSessionMinutes(Number(d.runner_max_session_minutes));
        if (d.runner_preferred_training_time) setPreferredTrainingTime(d.runner_preferred_training_time);
        if (typeof d.runner_has_recent_injury === 'boolean') setHasRecentInjury(d.runner_has_recent_injury);
        if (d.runner_recent_injury_detail)    setRecentInjuryDetail(d.runner_recent_injury_detail || '');
        if (Array.isArray(d.runner_injury_areas)) setInjuryAreas(d.runner_injury_areas);
      }
    };
    fetchRaces();
    fetchUserProfile();
  }, [user]);

  const fetchPlanForRace = useCallback(async (raceId: string) => {
    if (!user || !raceId) return;
    setLoadingPlan(true);
    setPlan(null);
    try {
      const planSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plans'), where('race_id', '==', raceId))
      );
      if (planSnap.empty) return;

      const planDoc  = planSnap.docs[0];
      const planData = planDoc.data();
      const planId   = planDoc.id;

      const workoutsSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', planId), orderBy('workout_date', 'asc'))
      );
      const workoutsData = workoutsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));

      setPlan({ id: planId, ...planData, workouts: workoutsData } as TrainingPlan);

      setLoadingVersions(true);
      const versSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plan_versions'),
          where('plan_id', '==', planId),
          orderBy('generated_at', 'desc'),
        )
      );
      setVersions(versSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingVersions(false);
    } catch (error) {
      console.warn('Error fetching training plan:', error);
    } finally {
      setLoadingPlan(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedRace) { fetchPlanForRace(selectedRace); }
    else { setPlan(null); }
  }, [selectedRace, fetchPlanForRace]);

  const handleGeneratePlan = async () => {
    if (!user || !selectedRace) return;
    try {
      const selectedRaceDetails = races.find(r => r.id === selectedRace);
      if (!selectedRaceDetails) throw new Error('Carrera no encontrada');

      const generatePlanFn = httpsCallable(functions, 'generatePlan');
      const res = await generatePlanFn({
        race: selectedRaceDetails,
        goal,
        config: {
          run_days_per_week:      runDays,
          run_days_of_week:       runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
          include_strength:       includeStrength,
          strength_days_of_week:  includeStrength && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
          strength_days_per_week: includeStrength ? (strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek.length : strengthDaysCount) : 0,
          last_race: hasPreviousMark ? {
            distance_km:  parseFloat(lastRaceDistance) || null,
            time:         lastRaceTime || null,
            time_seconds: parseTimeToSeconds(lastRaceTime),
          } : null,
          target_time:         targetRaceTime || null,
          target_time_seconds: parseTimeToSeconds(targetRaceTime),
          methodology,
          stored_zones: profileZones || undefined,
          experience_level: experienceLevel,
          age_range: ageRange,
          current_weekly_km: currentWeeklyKm,
          longest_recent_run_km: longestRecentRunKm,
          max_session_minutes: maxSessionMinutes,
          preferred_training_time: preferredTrainingTime,
          has_recent_injury: hasRecentInjury,
          recent_injury_detail: hasRecentInjury ? recentInjuryDetail : null,
          injury_areas: injuryAreas.length > 0 ? injuryAreas : null,
          race_terrain: raceTerrain,
          race_priority: racePriority,
        },
      });

      const functionResponse = res.data as any;
      if (!functionResponse?.plan) throw new Error('Respuesta inválida de la IA');

      // Delete existing plan for this race
      const oldPlanSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plans'), where('race_id', '==', selectedRace))
      );
      for (const oldPlan of oldPlanSnap.docs) {
        const oldWorkoutsSnap = await getDocs(
          query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', oldPlan.id))
        );
        for (const w of oldWorkoutsSnap.docs) { await deleteDoc(w.ref); }
        await deleteDoc(oldPlan.ref);
      }

      const meta = functionResponse.meta || {};

      const planRef = await addDoc(collection(db, 'users', user.uid, 'training_plans'), {
        race_id:                    selectedRace,
        goal,
        model:                      meta.model || null,
        used_fallback:              meta.fallback ?? null,
        openai_error:               meta.openAiError || null,
        run_days_per_week:          runDays,
        run_days_of_week:           runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
        include_strength:           includeStrength,
        strength_days_of_week:      includeStrength && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
        strength_days_per_week:     includeStrength ? (strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek.length : strengthDaysCount) : null,
        last_race_distance_km:      hasPreviousMark ? (parseFloat(lastRaceDistance) || null) : null,
        last_race_time_sec:         hasPreviousMark ? parseTimeToSeconds(lastRaceTime) : null,
        target_race_time_sec:       parseTimeToSeconds(targetRaceTime),
        methodology,
        // Mesocycle metadata
        total_weeks:                meta.total_weeks || null,
        total_mesocycles:           meta.total_mesocycles || null,
        mesocycle_number:           meta.mesocycle_number || 1,
        mesocycle_length_weeks:     meta.mesocycle_length_weeks || 5,
        mesocycle_start_date:       meta.mesocycle_start_date || null,
        mesocycle_end_date:         meta.mesocycle_end_date || null,
        created_at:                 serverTimestamp(),
      });

      const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
      const durRegex  = /(\d{1,3})\s?(?:min|mins|m)\b/i;
      for (const w of functionResponse.plan) {
        const desc: string = w.description || '';
        const dMatch = desc.match(distRegex);
        const tMatch = desc.match(durRegex);
        await addDoc(collection(db, 'users', user.uid, 'workouts'), {
          plan_id:          planRef.id,
          workout_date:     w.date,
          description:      desc,
          distance_km:      dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
          duration_min:     tMatch ? parseInt(tMatch[1], 10) : null,
          explanation_json: w.explanation || null,
          is_completed:     false,
          created_at:       serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'users', user.uid, 'training_plan_versions'), {
        plan_id:       planRef.id,
        race_id:       selectedRace,
        goal,
        model:         meta.model || null,
        used_fallback: meta.fallback ?? null,
        plan_json:     { workouts: functionResponse.plan },
        generated_at:  serverTimestamp(),
      });

      // Persist runner profile so future plans and next mesocycles inherit it
      await setDoc(doc(db, 'users', user.uid), {
        runner_experience_level:        experienceLevel,
        runner_age_range:               ageRange,
        runner_current_weekly_km:       currentWeeklyKm,
        runner_longest_recent_run_km:   longestRecentRunKm,
        runner_max_session_minutes:     maxSessionMinutes,
        runner_preferred_training_time: preferredTrainingTime,
        runner_has_recent_injury:       hasRecentInjury,
        runner_recent_injury_detail:    hasRecentInjury ? recentInjuryDetail : null,
        runner_injury_areas:            injuryAreas.length > 0 ? injuryAreas : [],
        runner_profile_updated_at:      serverTimestamp(),
      }, { merge: true });

      await fetchPlanForRace(selectedRace);
      setPlanMeta(functionResponse.meta || null);
      window.dispatchEvent(new Event('workouts-changed'));
      setResultModal({ success: true, message: `¡Mesociclo 1${meta.total_mesocycles > 1 ? ` de ${meta.total_mesocycles}` : ''} generado! Cubre las próximas ${meta.mesocycle_length_weeks || 5} semanas.` });
    } catch (error) {
      console.error('Error generating plan:', error);
      setResultModal({ success: false, message: `Error al generar el plan: ${error instanceof Error ? error.message : 'Error desconocido'}` });
    } finally {
      setLoading(false);
      setProgressModal(false);
    }
  };

  const handleGenerateNextMesocycle = async () => {
    if (!user || !plan) return;
    setLoadingNextMeso(true);
    setProgressModal(true);
    setProgressMessageIndex(0);
    try {
      const generateNextMesocycleFn = httpsCallable(functions, 'generateNextMesocycle');
      const res = await generateNextMesocycleFn({ plan_id: plan.id });
      const data = res.data as any;

      await fetchPlanForRace(selectedRace);
      window.dispatchEvent(new Event('workouts-changed'));
      setResultModal({
        success: true,
        message: `Mesociclo ${data.mesocycle_number} generado: ${data.mesocycle_start} → ${data.mesocycle_end} · ${data.workouts_added} entrenamientos añadidos.${data.fallback ? ' (plan algorítmico)' : ''}`,
      });
    } catch (err: any) {
      setResultModal({ success: false, message: `Error generando mesociclo: ${err.message || err}` });
    } finally {
      setLoadingNextMeso(false);
      setProgressModal(false);
    }
  };

  const handleRegenerateFromToday = async () => {
    if (!user || !plan || !selectedRace) return;
    setLoading(true);
    setProgressModal(true);
    setProgressMessageIndex(0);
    try {
      const race = races.find(r => r.id === selectedRace);
      if (!race) throw new Error('Carrera no encontrada');

      const generatePlanFn = httpsCallable(functions, 'generatePlan');
      const res = await generatePlanFn({
        race,
        goal,
        config: {
          run_days_per_week:      runDays,
          run_days_of_week:       runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
          include_strength:       includeStrength,
          strength_days_of_week:  includeStrength && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
          strength_days_per_week: includeStrength ? (strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek.length : strengthDaysCount) : 0,
          last_race: hasPreviousMark ? {
            distance_km:  parseFloat(lastRaceDistance) || null,
            time:         lastRaceTime || null,
            time_seconds: parseTimeToSeconds(lastRaceTime),
          } : null,
          target_time:         targetRaceTime || null,
          target_time_seconds: parseTimeToSeconds(targetRaceTime),
          methodology,
          stored_zones: profileZones || undefined,
          experience_level: experienceLevel,
          age_range: ageRange,
          current_weekly_km: currentWeeklyKm,
          longest_recent_run_km: longestRecentRunKm,
          max_session_minutes: maxSessionMinutes,
          preferred_training_time: preferredTrainingTime,
          has_recent_injury: hasRecentInjury,
          recent_injury_detail: hasRecentInjury ? recentInjuryDetail : null,
          injury_areas: injuryAreas.length > 0 ? injuryAreas : null,
          race_terrain: raceTerrain,
          race_priority: racePriority,
        },
      });

      const functionResponse = res.data as any;
      if (!functionResponse?.plan) throw new Error('Respuesta IA inválida');
      const meta = functionResponse.meta || {};

      await addDoc(collection(db, 'users', user.uid, 'training_plan_versions'), {
        plan_id:       plan.id,
        race_id:       race.id,
        goal:          plan.goal,
        model:         plan.model,
        used_fallback: plan.used_fallback,
        plan_json:     { workouts: plan.workouts },
        generated_at:  serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', user.uid, 'training_plans', plan.id), {
        model:                meta.model || null,
        used_fallback:        meta.fallback ?? null,
        openai_error:         meta.openAiError || null,
        total_weeks:          meta.total_weeks || null,
        total_mesocycles:     meta.total_mesocycles || null,
        mesocycle_number:     meta.mesocycle_number || 1,
        mesocycle_length_weeks: meta.mesocycle_length_weeks || 5,
        mesocycle_start_date: meta.mesocycle_start_date || null,
        mesocycle_end_date:   meta.mesocycle_end_date || null,
      });

      const todayISO = new Date().toISOString().substring(0, 10);
      const futureSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'),
          where('plan_id', '==', plan.id),
          where('workout_date', '>=', todayISO),
        )
      );
      for (const w of futureSnap.docs) { await deleteDoc(w.ref); }

      const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
      const durRegex  = /(\d{1,3})\s?(?:min|mins|m)\b/i;
      for (const w of functionResponse.plan) {
        if (w.date < todayISO) continue;
        const desc: string = w.description || '';
        const dMatch = desc.match(distRegex);
        const tMatch = desc.match(durRegex);
        await addDoc(collection(db, 'users', user.uid, 'workouts'), {
          plan_id:          plan.id,
          workout_date:     w.date,
          description:      desc,
          distance_km:      dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
          duration_min:     tMatch ? parseInt(tMatch[1], 10) : null,
          explanation_json: w.explanation || null,
          is_completed:     false,
          created_at:       serverTimestamp(),
        });
      }

      await setDoc(doc(db, 'users', user.uid), {
        runner_experience_level:        experienceLevel,
        runner_age_range:               ageRange,
        runner_current_weekly_km:       currentWeeklyKm,
        runner_longest_recent_run_km:   longestRecentRunKm,
        runner_max_session_minutes:     maxSessionMinutes,
        runner_preferred_training_time: preferredTrainingTime,
        runner_has_recent_injury:       hasRecentInjury,
        runner_recent_injury_detail:    hasRecentInjury ? recentInjuryDetail : null,
        runner_injury_areas:            injuryAreas.length > 0 ? injuryAreas : [],
        runner_profile_updated_at:      serverTimestamp(),
      }, { merge: true });

      await fetchPlanForRace(selectedRace);
      setPlanMeta(functionResponse.meta || null);
      window.dispatchEvent(new Event('workouts-changed'));
      setResultModal({ success: true, message: 'Mesociclo regenerado desde hoy.' });
    } catch (err: any) {
      setResultModal({ success: false, message: `Error regenerando: ${err.message || err}` });
    } finally {
      setLoading(false);
      setProgressModal(false);
    }
  };

  const handleLoadVersion = async (versionId: string) => {
    if (!user || !plan) return;
    setLoadingVersions(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'training_plan_versions', versionId));
      if (!snap.exists()) throw new Error('Versión no encontrada');
      setVersionPreview({ id: snap.id, ...snap.data() });
    } catch (e) {
      console.error('Error cargando versión:', e);
      alert('No se pudo cargar la versión');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!user || !plan) return;
    setLoading(true);
    try {
      const workoutsSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', plan.id))
      );
      for (const w of workoutsSnap.docs) { await deleteDoc(w.ref); }
      await deleteDoc(doc(db, 'users', user.uid, 'training_plans', plan.id));
      setPlan(null);
      setGoal('');
    } catch (error) {
      console.error('Error deleting plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedRaceDetails = races.find(r => r.id === selectedRace);

  // Should we show the "next mesocycle" button?
  const todayISO = new Date().toISOString().substring(0, 10);
  const mesoEnd  = plan?.mesocycle_end_date;
  const daysUntilMesoEnd = mesoEnd
    ? Math.ceil((new Date(mesoEnd).getTime() - new Date(todayISO).getTime()) / 86400000)
    : null;
  const canGenerateNextMeso = plan &&
    (plan.total_mesocycles ?? 1) > (plan.mesocycle_number ?? 1) &&
    daysUntilMesoEnd !== null && daysUntilMesoEnd <= 14;

  const startGeneration = () => {
    if (!user || !selectedRace || loading) return;
    setProgressMessageIndex(0);
    setProgressModal(true);
    setLoading(true);
    void handleGeneratePlan();
  };

  const toggleRunDay = (dow: number) => {
    setRunDaysOfWeek(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort()
    );
  };

  const toggleStrengthDay = (dow: number) => {
    setStrengthDaysOfWeek(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort()
    );
  };

  const toggleInjuryArea = (area: string) => {
    setInjuryAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  return (
    <main className="container mx-auto p-8 text-gray-800">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Mi Plan de Entrenamiento</h1>

      <div className="bg-white p-8 rounded-xl shadow-lg mb-12">
        <div className="mb-6">
          <label htmlFor="race" className="block text-lg font-medium text-gray-700 mb-2">
            Selecciona una carrera para ver o crear un plan
          </label>
          <select
            id="race"
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white text-gray-800"
          >
            <option value="">-- Elige una carrera --</option>
            {races.map(race => (
              <option key={race.id} value={race.id}>
                {race.name} ({new Date(race.date).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        {loadingPlan && <p>Cargando plan...</p>}

        {!loadingPlan && selectedRace && plan && (
          <div>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Plan para {selectedRaceDetails?.name}</h2>
                <p className="text-gray-600">Objetivo: {plan.goal}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {planMeta?.methodology && (
                    <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-semibold uppercase tracking-wide">
                      {planMeta.methodology === 'polarized' ? 'Polarizado' : planMeta.methodology === 'norwegian' ? 'Noruego' : 'Clásico'}
                    </span>
                  )}
                  {plan.model && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">Modelo: {plan.model}</span>}
                  {plan.used_fallback && <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">Algoritmo local</span>}
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={handleDeletePlan} disabled={loading}
                  className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors disabled:bg-gray-400 text-sm">
                  Eliminar plan
                </button>
                <button onClick={handleRegenerateFromToday} disabled={loading}
                  className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 text-sm">
                  {loading ? 'Procesando...' : 'Regenerar desde hoy'}
                </button>
              </div>
            </div>

            {/* Mesocycle progress */}
            {plan.total_weeks && plan.mesocycle_number && (
              <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-semibold text-indigo-800">
                      Mesociclo {plan.mesocycle_number}{plan.total_mesocycles ? ` de ${plan.total_mesocycles}` : ''}
                    </span>
                    {plan.mesocycle_start_date && plan.mesocycle_end_date && (
                      <span className="text-xs text-indigo-600 ml-2">
                        {new Date(plan.mesocycle_start_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {' → '}
                        {new Date(plan.mesocycle_end_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  {daysUntilMesoEnd !== null && daysUntilMesoEnd > 0 && daysUntilMesoEnd <= 21 && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${daysUntilMesoEnd <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {daysUntilMesoEnd <= 0 ? 'Terminado' : `Faltan ${daysUntilMesoEnd} días`}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {plan.total_mesocycles && plan.total_mesocycles > 1 && (
                  <div className="flex gap-1 mb-3">
                    {Array.from({ length: plan.total_mesocycles }).map((_, i) => (
                      <div key={i} className={`h-2 flex-1 rounded-full ${
                        i + 1 < plan.mesocycle_number! ? 'bg-indigo-500' :
                        i + 1 === plan.mesocycle_number ? 'bg-indigo-400' : 'bg-indigo-100'
                      }`} />
                    ))}
                  </div>
                )}

                {/* Overall completion stats */}
                {(() => {
                  const allTrain = plan.workouts.filter(w => !/descanso|rest/i.test(w.description));
                  const done = allTrain.filter(w => w.is_completed);
                  if (allTrain.length === 0) return null;
                  const pct = Math.round(done.length / allTrain.length * 100);
                  return (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">{done.length}/{allTrain.length} completados</span>
                    </div>
                  );
                })()}

                {canGenerateNextMeso && (
                  <button
                    onClick={handleGenerateNextMesocycle}
                    disabled={loadingNextMeso}
                    className="w-full sm:w-auto bg-indigo-600 text-white font-semibold py-2 px-5 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 text-sm"
                  >
                    {loadingNextMeso ? 'Generando…' : `Generar mesociclo ${(plan.mesocycle_number || 1) + 1}`}
                  </button>
                )}
                {(plan.total_mesocycles ?? 1) > (plan.mesocycle_number ?? 1) && !canGenerateNextMeso && daysUntilMesoEnd !== null && daysUntilMesoEnd > 14 && (
                  <p className="text-xs text-indigo-600">
                    El botón para generar el siguiente mesociclo aparecerá 2 semanas antes del final del actual.
                  </p>
                )}
              </div>
            )}

            {/* Training zones */}
            {planMeta?.zones && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Zonas de entrenamiento personalizadas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    { label: 'Z1 Fácil',   value: planMeta.zones.z1,   cls: 'bg-green-100 text-green-800',   sub: 'Conversacional · 80% vol' },
                    { label: 'Z4 Umbral',  value: planMeta.zones.z4,   cls: 'bg-yellow-100 text-yellow-800', sub: '≈ Ritmo 10k · LT2' },
                    { label: 'Z5 VO2max',  value: planMeta.zones.z5,   cls: 'bg-red-100 text-red-800',       sub: '≈ Ritmo 5k' },
                    { label: 'Objetivo',   value: planMeta.zones.race, cls: 'bg-purple-100 text-purple-800', sub: 'Ritmo de carrera' },
                  ].map(z => (
                    <div key={z.label} className={`${z.cls} rounded-lg p-2 text-center`}>
                      <div className="font-bold text-sm">{z.label}</div>
                      <div className="font-mono mt-1">{z.value}</div>
                      <div className="opacity-70 mt-1">{z.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phases */}
            {planMeta?.phases && planMeta.phases.length > 0 && (
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Periodización del plan completo</h3>
                <div className="flex flex-wrap gap-2">
                  {planMeta.phases.map((ph: any) => {
                    const colors: Record<string, string> = {
                      base: 'bg-teal-100 text-teal-800 border-teal-300',
                      desarrollo: 'bg-blue-100 text-blue-800 border-blue-300',
                      especifico: 'bg-orange-100 text-orange-800 border-orange-300',
                      taper: 'bg-purple-100 text-purple-800 border-purple-300',
                    };
                    const labels: Record<string, string> = {
                      base: 'Base aeróbica', desarrollo: 'Desarrollo',
                      especifico: 'Específico', taper: 'Taper',
                    };
                    return (
                      <span key={ph.name} className={`text-xs px-3 py-1 rounded-full border font-medium ${colors[ph.name] || 'bg-gray-100 text-gray-700'}`}>
                        {labels[ph.name] || ph.name} · sem {ph.startWeek}–{ph.endWeek}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ver en Calendario */}
            <Link to={`/calendar`}
              className="inline-flex items-center gap-2 w-full sm:w-auto justify-center px-5 py-3 mb-4 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-colors shadow-sm">
              ▦ Ver mis entrenamientos en el Calendario →
            </Link>

            {/* Versions */}
            <div className="mt-10">
              <h3 className="text-lg font-semibold mb-2">Versiones Anteriores</h3>
              {loadingVersions && <p className="text-sm text-gray-500">Cargando versiones...</p>}
              {!loadingVersions && versions.length === 0 && <p className="text-sm text-gray-500">Sin versiones aún.</p>}
              {!loadingVersions && versions.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {versions.map(v => (
                    <li key={v.id}
                      className="flex items-center justify-between border rounded px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleLoadVersion(v.id)}>
                      <span>{v.generated_at?.toDate ? v.generated_at.toDate().toLocaleString() : '—'} • {v.model || '—'} {v.used_fallback ? '(fallback)' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              {versionPreview && (
                <div className="mt-4 border rounded p-4 bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">Versión del {versionPreview.generated_at?.toDate ? versionPreview.generated_at.toDate().toLocaleString() : '—'}</h4>
                    <button onClick={() => setVersionPreview(null)} className="text-xs text-gray-500 hover:text-gray-700">Cerrar</button>
                  </div>
                  <ul className="space-y-2 max-h-60 overflow-auto pr-2 text-sm">
                    {(versionPreview.plan_json?.workouts || []).map((w: any, idx: number) => (
                      <li key={idx} className="border rounded px-2 py-1">
                        <span className="font-medium">{w.date || w.workout_date}</span>: {w.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <WeeklyAnalysis planId={plan.id} onWorkoutsChanged={() => fetchPlanForRace(selectedRace)} />
          </div>
        )}

        {/* Plan creation form */}
        {!loadingPlan && selectedRace && !plan && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Configura tu plan personalizado</h2>
              <p className="text-sm text-gray-500">Completa tu perfil para que el entrenador IA genere un plan completamente adaptado a ti.</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); startGeneration(); }} className="space-y-6">

              {/* SECTION 1: Perfil del corredor */}
              <div className="border border-gray-200 rounded-xl p-5 bg-white">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <h3 className="text-base font-semibold text-gray-800">Tu perfil como corredor</h3>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nivel de experiencia</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        { value: 'beginner',     label: 'Principiante',    desc: 'Menos de 1 año corriendo' },
                        { value: 'intermediate', label: 'Intermedio',      desc: '1–3 años, hasta 10k' },
                        { value: 'advanced',     label: 'Avanzado',        desc: '3+ años, medias y maratones' },
                        { value: 'elite',        label: 'Élite/Sub-élite', desc: 'Competitivo, alto volumen' },
                      ] as const).map(lvl => (
                        <label key={lvl.value} className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${experienceLevel === lvl.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                          <div className="flex items-center gap-2">
                            <input type="radio" name="experienceLevel" value={lvl.value} checked={experienceLevel === lvl.value} onChange={() => setExperienceLevel(lvl.value)} className="accent-orange-500" />
                            <span className="font-semibold text-sm text-gray-800">{lvl.label}</span>
                          </div>
                          <span className="text-xs text-gray-500 ml-5">{lvl.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rango de edad</label>
                    <div className="flex flex-wrap gap-2">
                      {['18-29', '30-39', '40-49', '50-59', '60+'].map(r => (
                        <button key={r} type="button" onClick={() => setAgeRange(r)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${ageRange === r ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Volumen actual */}
              <div className="border border-gray-200 rounded-xl p-5 bg-white">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <h3 className="text-base font-semibold text-gray-800">Tu entrenamiento actual</h3>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kilómetros por semana actualmente</label>
                    <p className="text-xs text-gray-400 mb-2">Promedio real de las últimas 4–6 semanas</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '< 20 km',   value: 15  },
                        { label: '20–40 km',  value: 30  },
                        { label: '40–60 km',  value: 50  },
                        { label: '60–80 km',  value: 70  },
                        { label: '80–100 km', value: 90  },
                        { label: '> 100 km',  value: 110 },
                      ].map(opt => (
                        <button key={opt.value} type="button" onClick={() => setCurrentWeeklyKm(opt.value)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${currentWeeklyKm === opt.value ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rodaje largo más reciente</label>
                    <p className="text-xs text-gray-400 mb-2">Tu carrera más larga en el último mes</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '< 10 km',  value: 8  },
                        { label: '10–15 km', value: 12 },
                        { label: '15–20 km', value: 17 },
                        { label: '20–25 km', value: 22 },
                        { label: '25–32 km', value: 28 },
                        { label: '> 32 km',  value: 35 },
                      ].map(opt => (
                        <button key={opt.value} type="button" onClick={() => setLongestRecentRunKm(opt.value)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${longestRecentRunKm === opt.value ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo máximo por sesión de entrenamiento</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '45 min',  value: 45  },
                        { label: '60 min',  value: 60  },
                        { label: '75 min',  value: 75  },
                        { label: '90 min',  value: 90  },
                        { label: '2 horas', value: 120 },
                        { label: '2h 30+',  value: 150 },
                      ].map(opt => (
                        <button key={opt.value} type="button" onClick={() => setMaxSessionMinutes(opt.value)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${maxSessionMinutes === opt.value ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-700 border-gray-300 hover:border-teal-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Disponibilidad semanal */}
              <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <h3 className="text-base font-semibold text-gray-800">Tu disponibilidad semanal</h3>
                </div>

                {/* Running days */}
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-gray-700">Días de running por semana</legend>
                  <div className="flex items-center gap-3">
                    <input type="number" min={2} max={7} value={runDaysOfWeek.length > 0 ? runDaysOfWeek.length : runDays}
                      onChange={e => { setRunDays(parseInt(e.target.value, 10)); setRunDaysOfWeek([]); }}
                      className="w-20 p-2 border rounded bg-white text-gray-800 text-center" />
                    <span className="text-sm text-gray-500">días/semana</span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">Días específicos (opcional — si no eliges, el entrenador los distribuye)</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAY_LABELS.map((label, dow) => (
                        <button key={dow} type="button" onClick={() => toggleRunDay(dow)}
                          className={`w-12 h-12 rounded-lg text-xs font-semibold border-2 transition-colors ${
                            runDaysOfWeek.includes(dow)
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {runDaysOfWeek.length > 0 && (
                      <p className="text-xs text-orange-600 mt-2">
                        Running los: {runDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                        <button type="button" onClick={() => setRunDaysOfWeek([])} className="ml-2 underline text-gray-500 hover:text-gray-700">limpiar</button>
                      </p>
                    )}
                  </div>
                </fieldset>

                {/* Strength */}
                <fieldset className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <legend className="text-sm font-medium text-gray-700">Entrenamiento de fuerza running-specific</legend>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={includeStrength} onChange={e => setIncludeStrength(e.target.checked)} className="accent-indigo-600" />
                      <span className="text-indigo-700 font-medium">Incluir fuerza en el plan</span>
                    </label>
                  </div>
                  {includeStrength && (
                    <div className="space-y-3 pl-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-700">Sesiones/semana:</span>
                        <div className="flex gap-1">
                          {[1, 2, 3].map(n => (
                            <button key={n} type="button"
                              onClick={() => { setStrengthDaysCount(n); setStrengthDaysOfWeek([]); }}
                              className={`w-10 h-10 rounded-lg text-sm font-bold border-2 transition-colors ${
                                (strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek.length : strengthDaysCount) === n
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                              }`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-2">Días específicos de fuerza (opcional)</label>
                        <div className="flex gap-2 flex-wrap">
                          {DAY_LABELS.map((label, dow) => (
                            <button key={dow} type="button" onClick={() => toggleStrengthDay(dow)}
                              className={`w-12 h-12 rounded-lg text-xs font-semibold border-2 transition-colors ${
                                strengthDaysOfWeek.includes(dow)
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                              }`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {strengthDaysOfWeek.length > 0 && (
                          <p className="text-xs text-indigo-600 mt-2">
                            Fuerza los: {strengthDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                            <button type="button" onClick={() => setStrengthDaysOfWeek([])} className="ml-2 underline text-gray-500 hover:text-gray-700">limpiar</button>
                          </p>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Rutinas periodizadas por fase: excéntrica (base) → fuerza máxima (desarrollo) → pliometría (específico).
                      </p>
                    </div>
                  )}
                </fieldset>

                {/* Preferred training time */}
                <div className="pt-4 border-t border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Momento preferido para entrenar</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'morning',   label: 'Mañana'         },
                      { value: 'afternoon', label: 'Tarde'          },
                      { value: 'evening',   label: 'Noche'          },
                      { value: 'any',       label: 'Cualquier hora' },
                    ] as const).map(t => (
                      <button key={t.value} type="button" onClick={() => setPreferredTrainingTime(t.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${preferredTrainingTime === t.value ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 4: Lesiones y limitaciones */}
              <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">4</span>
                  <h3 className="text-base font-semibold text-gray-800">Lesiones y limitaciones</h3>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={hasRecentInjury} onChange={e => setHasRecentInjury(e.target.checked)} className="accent-red-500" />
                  <span>Tengo o he tenido una lesión reciente (últimas 8 semanas)</span>
                </label>
                {hasRecentInjury && (
                  <input type="text" value={recentInjuryDetail} onChange={e => setRecentInjuryDetail(e.target.value)}
                    placeholder="Describe brevemente (ej: tendinitis aquíleo izquierdo, ya en recuperación)"
                    className="w-full p-2.5 border border-red-200 rounded-lg text-sm bg-white text-gray-800 placeholder-gray-400 focus:ring-1 focus:ring-red-400 focus:outline-none" />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Zonas de atención crónicas</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Rodillas', 'Talón de Aquiles', 'Cintilla IT', 'Fascitis plantar',
                      'Cadera / glúteo', 'Espalda baja', 'Tibias (periostitis)', 'Sin lesiones conocidas',
                    ].map(area => (
                      <button key={area} type="button" onClick={() => toggleInjuryArea(area)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                          injuryAreas.includes(area)
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-red-300'
                        }`}>
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 5: Objetivo y datos de carrera */}
              <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">5</span>
                  <h3 className="text-base font-semibold text-gray-800">Objetivo y datos de la carrera</h3>
                </div>

                {/* Terrain */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de terreno de la carrera</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      { value: 'road',  label: 'Asfalto', desc: 'Carretera o ciudad' },
                      { value: 'trail', label: 'Trail',   desc: 'Montaña y senderos' },
                      { value: 'mixed', label: 'Mixto',   desc: 'Asfalto y trail'    },
                      { value: 'track', label: 'Pista',   desc: 'Estadio atletismo'  },
                    ] as const).map(t => (
                      <label key={t.value} className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${raceTerrain === t.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="raceTerrain" value={t.value} checked={raceTerrain === t.value} onChange={() => setRaceTerrain(t.value)} className="accent-orange-500" />
                          <span className="font-semibold text-sm text-gray-800">{t.label}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-5">{t.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Race priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad de esta carrera en tu temporada</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { value: 'A', label: 'Carrera A', desc: 'Objetivo principal — taper completo, máxima preparación' },
                      { value: 'B', label: 'Carrera B', desc: 'Objetivo secundario — taper parcial (3–4 días)' },
                      { value: 'C', label: 'Carrera C', desc: 'Carrera de entrenamiento — sin tapering específico' },
                    ] as const).map(p => (
                      <label key={p.value} className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${racePriority === p.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="racePriority" value={p.value} checked={racePriority === p.value} onChange={() => setRacePriority(p.value)} className="accent-orange-500" />
                          <span className="font-semibold text-sm text-gray-800">{p.label}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-5">{p.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Previous mark and target */}
                <div className="pt-1 border-t border-gray-100 space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={hasPreviousMark} onChange={e => setHasPreviousMark(e.target.checked)} className="accent-orange-500" />
                    <span className="font-medium">Tengo una marca previa de referencia</span>
                  </label>
                  {hasPreviousMark && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Distancia (km)</label>
                        <input type="number" step="0.1" className="w-full p-2.5 border rounded-lg bg-white text-gray-800 focus:ring-1 focus:ring-orange-400 focus:outline-none" value={lastRaceDistance} onChange={e => setLastRaceDistance(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Tiempo conseguido (H:MM:SS)</label>
                        <input type="text" placeholder="0:45:30" className="w-full p-2.5 border rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:ring-1 focus:ring-orange-400 focus:outline-none" value={lastRaceTime} onChange={e => setLastRaceTime(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Tiempo objetivo (H:MM:SS)</label>
                        <input type="text" placeholder="0:42:00" className="w-full p-2.5 border rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:ring-1 focus:ring-orange-400 focus:outline-none" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {!hasPreviousMark && (
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Tiempo objetivo (H:MM:SS) — si tienes uno</label>
                      <input type="text" placeholder="Ej: 0:45:00 para 10k" className="w-full sm:w-64 p-2.5 border rounded-lg bg-white text-gray-800 placeholder-gray-400 focus:ring-1 focus:ring-orange-400 focus:outline-none" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Goal text */}
                <div className="pt-1 border-t border-gray-100">
                  <label htmlFor="goal" className="block text-sm font-medium text-gray-700 mb-1">Tu objetivo en palabras <span className="text-red-400">*</span></label>
                  <p className="text-xs text-gray-400 mb-2">Cuéntale al entrenador qué quieres lograr con este plan</p>
                  <input type="text" id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white text-gray-800 placeholder-gray-400"
                    placeholder="Ej: Terminar mi primer maratón, mejorar 10 min mi marca, disfrutar el recorrido…"
                    required />
                </div>
              </div>

              {/* SECTION 6: Metodología */}
              <div className="border border-orange-100 rounded-xl p-5 bg-orange-50/20">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">6</span>
                  <h3 className="text-base font-semibold text-gray-800">Metodología de entrenamiento</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { value: 'polarized', label: 'Polarizado', desc: '80% fácil Z1 · 20% alta intensidad. Máxima evidencia científica (Seiler).' },
                    { value: 'norwegian', label: 'Noruego',    desc: '2 sesiones de umbral/semana. Todo lo demás Z1 estricto (Ingebrigtsen).' },
                    { value: 'classic',   label: 'Clásico',    desc: 'Series martes · Tempo jueves · Largo domingo. Progresión lineal.' },
                  ] as const).map(m => (
                    <label key={m.value}
                      className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer transition-colors ${methodology === m.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="methodology" value={m.value} checked={methodology === m.value} onChange={() => setMethodology(m.value)} className="accent-orange-500" />
                        <span className="font-semibold text-sm text-gray-800">{m.label}</span>
                      </div>
                      <span className="text-xs text-gray-500 ml-5">{m.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Calibrated zones notice */}
              {profileZones && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm">
                  <p className="text-teal-800 font-semibold mb-1">Zonas calibradas desde tu Strava</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {[
                      { label: 'Z1 Fácil',  sec: profileZones.z1_sec_km },
                      { label: 'Z4 Umbral', sec: profileZones.z4_sec_km },
                      { label: 'Z5 VO2max', sec: profileZones.z5_sec_km },
                    ].map(z => {
                      const mm = Math.floor(z.sec / 60);
                      const ss = Math.round(z.sec % 60).toString().padStart(2, '0');
                      return (
                        <span key={z.label} className="bg-white border border-teal-200 rounded px-2 py-1 font-mono text-teal-700">
                          {z.label}: {mm}:{ss}/km
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mesocycle explanation */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                <p className="font-semibold mb-1">Plan por mesociclos</p>
                <p className="text-xs text-indigo-700">Se generará el primer mesociclo (5 semanas). Al acercarse al final de cada bloque podrás generar el siguiente, adaptado a tu progreso real.</p>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-orange-500 text-white font-bold py-4 px-6 rounded-xl hover:bg-orange-600 transition-colors disabled:bg-gray-400 text-base shadow-md">
                {loading ? 'Generando…' : 'Generar mi plan personalizado con IA'}
              </button>
            </form>
          </div>
        )}
      </div>

      {progressModal && <ProgressPortal message={progressMessages[progressMessageIndex]} />}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 relative">
            <button onClick={() => setResultModal(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 mb-4 rounded-full flex items-center justify-center text-xl ${resultModal.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {resultModal.success ? '✓' : '!'}
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{resultModal.success ? 'Listo' : 'Error'}</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{resultModal.message}</p>
              <button onClick={() => setResultModal(null)} className="mt-6 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default TrainingPlanPage;
