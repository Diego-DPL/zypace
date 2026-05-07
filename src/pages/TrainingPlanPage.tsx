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
import { Race } from '../types';
import WeeklyAnalysis from '../components/WeeklyAnalysis';
import AddGoalModal from '../components/AddGoalModal';

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
  const [mesoHistory, setMesoHistory] = useState<any[]>([]);
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
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
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
        <div className="bg-zinc-900 relative rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col items-center text-center overflow-hidden">
          <div className="relative z-10 flex flex-col items-center w-full">
            <div className="w-16 h-16 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-700" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-lime-400 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-lime-400/10 animate-pulse" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Generando mesociclo</h3>
            <p className="text-sm text-zinc-200 font-medium min-h-[44px] leading-relaxed transition-opacity duration-700 px-1">{message}</p>
            <p className="mt-3 text-[11px] text-zinc-500">Puede tardar un momento. No cierres esta pestaña.</p>
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

  function secsToTimeStr(secs: number): string {
    if (!secs || secs <= 0) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
    setMesoHistory([]);
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

      // ── Restore all plan-specific form fields ──────────────────
      if (planData.goal)                    setGoal(planData.goal as string);
      if (planData.run_days_per_week)       setRunDays(Number(planData.run_days_per_week));
      if (Array.isArray(planData.run_days_of_week)) setRunDaysOfWeek(planData.run_days_of_week as number[]);
      setIncludeStrength(!!planData.include_strength);
      if (Array.isArray(planData.strength_days_of_week)) setStrengthDaysOfWeek(planData.strength_days_of_week as number[]);
      if (planData.strength_days_per_week)  setStrengthDaysCount(Number(planData.strength_days_per_week));
      if (planData.methodology)             setMethodology(planData.methodology as 'polarized' | 'norwegian' | 'classic');
      // Restore previous mark
      if (planData.last_race_distance_km) {
        setHasPreviousMark(true);
        setLastRaceDistance(String(planData.last_race_distance_km));
      }
      if (planData.last_race_time_sec) setLastRaceTime(secsToTimeStr(planData.last_race_time_sec as number));
      if (planData.target_race_time_sec) setTargetRaceTime(secsToTimeStr(planData.target_race_time_sec as number));

      setLoadingVersions(true);
      const versSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plan_versions'),
          where('plan_id', '==', planId),
          orderBy('generated_at', 'desc'),
        )
      );
      setVersions(versSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingVersions(false);

      const histSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'mesocycle_history'),
          where('plan_id', '==', planId),
          orderBy('mesocycle_number', 'asc'),
        )
      );
      setMesoHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        goal: goal || plan.goal,  // fallback to saved goal if form field is empty
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

      const todayISO    = new Date().toISOString().substring(0, 10);
      const tomorrowISO = new Date(Date.now() + 86400000).toISOString().substring(0, 10);

      // Delete only from tomorrow onwards — keep today's workout (completed or not)
      const futureSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'),
          where('plan_id', '==', plan.id),
          where('workout_date', '>=', tomorrowISO),
        )
      );
      for (const w of futureSnap.docs) { await deleteDoc(w.ref); }

      const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
      const durRegex  = /(\d{1,3})\s?(?:min|mins|m)\b/i;
      for (const w of functionResponse.plan) {
        if (w.date <= todayISO) continue;  // skip today and past — only save from tomorrow
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

  // ── Migrate strength workouts via AI ──────────────────────────────────────
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  const migrateStrengthWorkouts = async () => {
    if (!user || !plan) return;
    setMigrating(true);
    setMigrateResult(null);
    try {
      const migrateStrengthFn = httpsCallable(functions, 'migrateStrengthExercises', { timeout: 180000 });
      const res  = await migrateStrengthFn({ plan_id: plan.id });
      const data = res.data as { converted: number; message: string };
      setMigrateResult(data.message);
      // Reload plan to reflect changes
      if (data.converted > 0) await fetchPlanForRace(selectedRace);
    } catch (e: any) {
      setMigrateResult(`Error: ${e.message}`);
    } finally {
      setMigrating(false);
    }
  };

  // Show button whenever there are strength workouts (allow re-running to fix bad data)
  const strengthWorkoutCount = plan?.workouts.filter(w =>
    w.explanation_json?.type === 'fuerza' || /fuerza/i.test(w.description)
  ).length ?? 0;

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
    <main className="container mx-auto p-8 text-zinc-100">
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <h1 className="text-4xl font-bold text-zinc-100">Mi Plan de Entrenamiento</h1>
        <button
          onClick={() => setShowAddGoal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-700 transition-colors"
        >+ Añadir objetivo</button>
      </div>

      <div className="bg-zinc-900 p-8 rounded-xl shadow-lg mb-12">
        <div className="mb-6">
          <label htmlFor="race" className="block text-lg font-medium text-zinc-200 mb-2">
            Selecciona una carrera para ver o crear un plan
          </label>
          <select
            id="race"
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className="w-full p-3 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-lime-400 focus:border-lime-400 bg-zinc-900 text-zinc-100"
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
                <h2 className="text-2xl font-bold text-zinc-100">Plan para {selectedRaceDetails?.name}</h2>
                <p className="text-zinc-400">Objetivo: {plan.goal}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {planMeta?.methodology && (
                    <span className="bg-lime-400/10 border border-lime-400/30 text-lime-400 px-2 py-1 rounded font-semibold uppercase tracking-wide text-[11px]">
                      {planMeta.methodology === 'polarized' ? 'Polarizado' : planMeta.methodology === 'norwegian' ? 'Noruego' : 'Clásico'}
                    </span>
                  )}
                  {plan.model && <span className="bg-zinc-800 text-zinc-200 px-2 py-1 rounded text-[11px]">Modelo: {plan.model}</span>}
                  {plan.used_fallback && <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded text-[11px]">Algoritmo local</span>}
                </div>
              </div>
              <div className="flex gap-3 flex-wrap items-center">
                {strengthWorkoutCount > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={migrateStrengthWorkouts}
                      disabled={migrating}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm flex items-center gap-1.5"
                    >
                      {migrating ? 'Procesando…' : `Estructurar fuerza (${strengthWorkoutCount})`}
                    </button>
                    {migrateResult && (
                      <span className="text-xs text-zinc-400">{migrateResult}</span>
                    )}
                  </div>
                )}
                <button onClick={handleDeletePlan} disabled={loading}
                  className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors disabled:bg-gray-400 text-sm">
                  Eliminar plan
                </button>
                <button onClick={() => setShowRegenModal(true)} disabled={loading}
                  className="bg-lime-400 text-black font-semibold py-2 px-4 rounded-lg hover:bg-lime-500 transition-colors disabled:opacity-50 text-sm">
                  Regenerar plan
                </button>
              </div>
            </div>

            {/* Mesocycle progress */}
            {plan.total_weeks && plan.mesocycle_number && (
              <div className="mb-6 p-4 bg-indigo-950/40 border border-indigo-800 rounded-xl">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-semibold text-indigo-300">
                      Mesociclo {plan.mesocycle_number}{plan.total_mesocycles ? ` de ${plan.total_mesocycles}` : ''}
                    </span>
                    {plan.mesocycle_start_date && plan.mesocycle_end_date && (
                      <span className="text-xs text-indigo-400 ml-2">
                        {new Date(plan.mesocycle_start_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {' → '}
                        {new Date(plan.mesocycle_end_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  {daysUntilMesoEnd !== null && daysUntilMesoEnd > 0 && daysUntilMesoEnd <= 21 && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium border ${daysUntilMesoEnd <= 7 ? 'bg-lime-400/10 border-lime-400/30 text-lime-400' : 'bg-indigo-900/40 border-indigo-800 text-indigo-400'}`}>
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
                        i + 1 === plan.mesocycle_number ? 'bg-indigo-400' : 'bg-zinc-700'
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
                      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500 flex-shrink-0">{done.length}/{allTrain.length} completados</span>
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
                  <p className="text-xs text-indigo-400">
                    El botón para generar el siguiente mesociclo aparecerá 2 semanas antes del final del actual.
                  </p>
                )}
              </div>
            )}

            {/* Training zones */}
            {planMeta?.zones && (
              <div className="mb-6 p-4 bg-zinc-800 border border-zinc-700 rounded-lg">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Zonas de entrenamiento personalizadas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    { label: 'Z1 Fácil',   value: planMeta.zones.z1,   cls: 'bg-green-950/50 border border-green-800 text-green-400',   sub: 'Conversacional · 80% vol' },
                    { label: 'Z4 Umbral',  value: planMeta.zones.z4,   cls: 'bg-yellow-950/50 border border-yellow-800 text-yellow-400', sub: '≈ Ritmo 10k · LT2' },
                    { label: 'Z5 VO2max',  value: planMeta.zones.z5,   cls: 'bg-red-950/50 border border-red-800 text-red-400',         sub: '≈ Ritmo 5k' },
                    { label: 'Objetivo',   value: planMeta.zones.race, cls: 'bg-purple-950/50 border border-purple-800 text-purple-400', sub: 'Ritmo de carrera' },
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
              <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Periodización del plan completo</h3>
                <div className="flex flex-wrap gap-2">
                  {planMeta.phases.map((ph: any) => {
                    const colors: Record<string, string> = {
                      base: 'bg-teal-950/50 text-teal-400 border-teal-800',
                      desarrollo: 'bg-blue-950/50 text-blue-400 border-blue-800',
                      especifico: 'bg-lime-950/50 text-lime-400 border-lime-800',
                      taper: 'bg-purple-950/50 text-purple-400 border-purple-800',
                    };
                    const labels: Record<string, string> = {
                      base: 'Base aeróbica', desarrollo: 'Desarrollo',
                      especifico: 'Específico', taper: 'Taper',
                    };
                    return (
                      <span key={ph.name} className={`text-xs px-3 py-1 rounded-full border font-medium ${colors[ph.name] || 'bg-zinc-800 text-zinc-200'}`}>
                        {labels[ph.name] || ph.name} · sem {ph.startWeek}–{ph.endWeek}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mesocycle history */}
            {mesoHistory.length > 0 && (
              <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Historial de mesociclos</h3>
                <div className="space-y-2">
                  {mesoHistory.map((h: any) => {
                    const adh = h.adherence_pct ?? null;
                    const fatigue = h.fatigue_index ?? null;
                    const adhColor = adh === null ? 'text-zinc-600' : adh >= 90 ? 'text-green-600' : adh >= 70 ? 'text-amber-600' : 'text-red-600';
                    const fatColor = fatigue === null ? 'text-zinc-600' : fatigue >= 75 ? 'text-red-600' : fatigue >= 55 ? 'text-amber-600' : 'text-green-600';
                    return (
                      <div key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                        <span className="font-semibold text-indigo-400 w-20 shrink-0">Meso {h.mesocycle_number}</span>
                        <span className="text-zinc-500 shrink-0">
                          {h.start_date ? new Date(h.start_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'}
                          {' → '}
                          {h.end_date ? new Date(h.end_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'}
                        </span>
                        <span className={`font-semibold ${adhColor}`}>
                          {adh !== null ? `${adh}% adherencia` : 'sin adherencia'}
                        </span>
                        {h.total_km > 0 && <span className="text-zinc-400">{h.total_km} km</span>}
                        {h.avg_rpe !== null && h.avg_rpe !== undefined && (
                          <span className="text-zinc-400">RPE {h.avg_rpe}/10</span>
                        )}
                        {fatigue !== null && (
                          <span className={`font-medium ${fatColor}`}>
                            Fatiga {fatigue}/100
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ver en Calendario */}
            <Link to={`/calendar`}
              className="inline-flex items-center gap-2 w-full sm:w-auto justify-center px-5 py-3 mb-4 rounded-xl bg-lime-400 text-black font-semibold text-sm hover:bg-lime-500 transition-colors shadow-sm">
              ▦ Ver mis entrenamientos en el Calendario →
            </Link>

            {/* Versions */}
            <div className="mt-10">
              <h3 className="text-lg font-semibold mb-2">Versiones Anteriores</h3>
              {loadingVersions && <p className="text-sm text-zinc-500">Cargando versiones...</p>}
              {!loadingVersions && versions.length === 0 && <p className="text-sm text-zinc-500">Sin versiones aún.</p>}
              {!loadingVersions && versions.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {versions.map(v => (
                    <li key={v.id}
                      className="flex items-center justify-between border rounded px-3 py-2 bg-zinc-900 cursor-pointer hover:bg-zinc-800"
                      onClick={() => handleLoadVersion(v.id)}>
                      <span>{v.generated_at?.toDate ? v.generated_at.toDate().toLocaleString() : '—'} • {v.model || '—'} {v.used_fallback ? '(fallback)' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              {versionPreview && (
                <div className="mt-4 border border-zinc-700 rounded p-4 bg-zinc-800">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">Versión del {versionPreview.generated_at?.toDate ? versionPreview.generated_at.toDate().toLocaleString() : '—'}</h4>
                    <button onClick={() => setVersionPreview(null)} className="text-xs text-zinc-500 hover:text-zinc-200">Cerrar</button>
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
              <h2 className="text-2xl font-bold text-zinc-100 mb-1">Configura tu plan personalizado</h2>
              <p className="text-sm text-zinc-500">Completa tu perfil para que el entrenador IA genere un plan completamente adaptado a ti.</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); startGeneration(); }} className="space-y-6">

              {/* SECTION 1: Perfil del corredor */}
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-800">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <h3 className="text-base font-semibold text-zinc-100">Tu perfil como corredor</h3>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-200 mb-2">Nivel de experiencia</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        { value: 'beginner',     label: 'Principiante',    desc: 'Menos de 1 año corriendo' },
                        { value: 'intermediate', label: 'Intermedio',      desc: '1–3 años, hasta 10k' },
                        { value: 'advanced',     label: 'Avanzado',        desc: '3+ años, medias y maratones' },
                        { value: 'elite',        label: 'Élite/Sub-élite', desc: 'Competitivo, alto volumen' },
                      ] as const).map(lvl => (
                        <label key={lvl.value} className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${experienceLevel === lvl.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-900 hover:border-lime-400/50'}`}>
                          <div className="flex items-center gap-2">
                            <input type="radio" name="experienceLevel" value={lvl.value} checked={experienceLevel === lvl.value} onChange={() => setExperienceLevel(lvl.value)} className="accent-orange-500" />
                            <span className="font-semibold text-sm text-zinc-100">{lvl.label}</span>
                          </div>
                          <span className="text-xs text-zinc-500 ml-5">{lvl.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-200 mb-2">Rango de edad</label>
                    <div className="flex flex-wrap gap-2">
                      {['18-29', '30-39', '40-49', '50-59', '60+'].map(r => (
                        <button key={r} type="button" onClick={() => setAgeRange(r)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${ageRange === r ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-lime-400'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Volumen actual */}
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-800">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <h3 className="text-base font-semibold text-zinc-100">Tu entrenamiento actual</h3>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-200 mb-1">Kilómetros por semana actualmente</label>
                    <p className="text-xs text-zinc-600 mb-2">Promedio real de las últimas 4–6 semanas</p>
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
                          className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${currentWeeklyKm === opt.value ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-lime-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-200 mb-1">Rodaje largo más reciente</label>
                    <p className="text-xs text-zinc-600 mb-2">Tu carrera más larga en el último mes</p>
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
                          className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${longestRecentRunKm === opt.value ? 'bg-blue-500 text-white border-blue-500' : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-blue-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-200 mb-1">Tiempo máximo por sesión de entrenamiento</label>
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
                          className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${maxSessionMinutes === opt.value ? 'bg-teal-500 text-white border-teal-500' : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-teal-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Disponibilidad semanal */}
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-800 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <h3 className="text-base font-semibold text-zinc-100">Tu disponibilidad semanal</h3>
                </div>

                {/* Running days */}
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-zinc-200">Días de running por semana</legend>
                  <div className="flex items-center gap-3">
                    <input type="number" min={2} max={7} value={runDaysOfWeek.length > 0 ? runDaysOfWeek.length : runDays}
                      onChange={e => { setRunDays(parseInt(e.target.value, 10)); setRunDaysOfWeek([]); }}
                      className="w-20 p-2 border rounded bg-zinc-900 text-zinc-100 text-center" />
                    <span className="text-sm text-zinc-500">días/semana</span>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-2">Días específicos (opcional — si no eliges, el entrenador los distribuye)</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAY_LABELS.map((label, dow) => (
                        <button key={dow} type="button" onClick={() => toggleRunDay(dow)}
                          className={`w-12 h-12 rounded-lg text-xs font-semibold border-2 transition-colors ${
                            runDaysOfWeek.includes(dow)
                              ? 'bg-lime-400 text-black border-lime-400'
                              : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-lime-400'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {runDaysOfWeek.length > 0 && (
                      <p className="text-xs text-lime-600 mt-2">
                        Running los: {runDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                        <button type="button" onClick={() => setRunDaysOfWeek([])} className="ml-2 underline text-zinc-500 hover:text-zinc-200">limpiar</button>
                      </p>
                    )}
                  </div>
                </fieldset>

                {/* Strength */}
                <fieldset className="space-y-3 pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <legend className="text-sm font-medium text-zinc-200">Entrenamiento de fuerza running-specific</legend>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={includeStrength} onChange={e => setIncludeStrength(e.target.checked)} className="accent-indigo-600" />
                      <span className="text-indigo-400 font-medium">Incluir fuerza en el plan</span>
                    </label>
                  </div>
                  {includeStrength && (
                    <div className="space-y-3 pl-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-zinc-200">Sesiones/semana:</span>
                        <div className="flex gap-1">
                          {[1, 2, 3].map(n => (
                            <button key={n} type="button"
                              onClick={() => { setStrengthDaysCount(n); setStrengthDaysOfWeek([]); }}
                              className={`w-10 h-10 rounded-lg text-sm font-bold border-2 transition-colors ${
                                (strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek.length : strengthDaysCount) === n
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-indigo-400'
                              }`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-2">Días específicos de fuerza (opcional)</label>
                        <div className="flex gap-2 flex-wrap">
                          {DAY_LABELS.map((label, dow) => (
                            <button key={dow} type="button" onClick={() => toggleStrengthDay(dow)}
                              className={`w-12 h-12 rounded-lg text-xs font-semibold border-2 transition-colors ${
                                strengthDaysOfWeek.includes(dow)
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-indigo-400'
                              }`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {strengthDaysOfWeek.length > 0 && (
                          <p className="text-xs text-indigo-600 mt-2">
                            Fuerza los: {strengthDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                            <button type="button" onClick={() => setStrengthDaysOfWeek([])} className="ml-2 underline text-zinc-500 hover:text-zinc-200">limpiar</button>
                          </p>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600">
                        Rutinas periodizadas por fase: excéntrica (base) → fuerza máxima (desarrollo) → pliometría (específico).
                      </p>
                    </div>
                  )}
                </fieldset>

                {/* Preferred training time */}
                <div className="pt-4 border-t border-zinc-800">
                  <label className="block text-sm font-medium text-zinc-200 mb-2">Momento preferido para entrenar</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'morning',   label: 'Mañana'         },
                      { value: 'afternoon', label: 'Tarde'          },
                      { value: 'evening',   label: 'Noche'          },
                      { value: 'any',       label: 'Cualquier hora' },
                    ] as const).map(t => (
                      <button key={t.value} type="button" onClick={() => setPreferredTrainingTime(t.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${preferredTrainingTime === t.value ? 'bg-amber-500 text-white border-amber-500' : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-amber-400'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 4: Lesiones y limitaciones */}
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-800 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center flex-shrink-0">4</span>
                  <h3 className="text-base font-semibold text-zinc-100">Lesiones y limitaciones</h3>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={hasRecentInjury} onChange={e => setHasRecentInjury(e.target.checked)} className="accent-red-500" />
                  <span>Tengo o he tenido una lesión reciente (últimas 8 semanas)</span>
                </label>
                {hasRecentInjury && (
                  <input type="text" value={recentInjuryDetail} onChange={e => setRecentInjuryDetail(e.target.value)}
                    placeholder="Describe brevemente (ej: tendinitis aquíleo izquierdo, ya en recuperación)"
                    className="w-full p-2.5 border border-red-200 rounded-lg text-sm bg-zinc-900 text-zinc-100 placeholder-gray-400 focus:ring-1 focus:ring-red-400 focus:outline-none" />
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-200 mb-2">Zonas de atención crónicas</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Rodillas', 'Talón de Aquiles', 'Cintilla IT', 'Fascitis plantar',
                      'Cadera / glúteo', 'Espalda baja', 'Tibias (periostitis)', 'Sin lesiones conocidas',
                    ].map(area => (
                      <button key={area} type="button" onClick={() => toggleInjuryArea(area)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                          injuryAreas.includes(area)
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-red-300'
                        }`}>
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 5: Objetivo y datos de carrera */}
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-800 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center flex-shrink-0">5</span>
                  <h3 className="text-base font-semibold text-zinc-100">Objetivo y datos de la carrera</h3>
                </div>

                {/* Terrain */}
                <div>
                  <label className="block text-sm font-medium text-zinc-200 mb-2">Tipo de terreno de la carrera</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      { value: 'road',  label: 'Asfalto', desc: 'Carretera o ciudad' },
                      { value: 'trail', label: 'Trail',   desc: 'Montaña y senderos' },
                      { value: 'mixed', label: 'Mixto',   desc: 'Asfalto y trail'    },
                      { value: 'track', label: 'Pista',   desc: 'Estadio atletismo'  },
                    ] as const).map(t => (
                      <label key={t.value} className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${raceTerrain === t.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-900 hover:border-lime-400/50'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="raceTerrain" value={t.value} checked={raceTerrain === t.value} onChange={() => setRaceTerrain(t.value)} className="accent-orange-500" />
                          <span className="font-semibold text-sm text-zinc-100">{t.label}</span>
                        </div>
                        <span className="text-xs text-zinc-500 ml-5">{t.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Race priority */}
                <div>
                  <label className="block text-sm font-medium text-zinc-200 mb-2">Prioridad de esta carrera en tu temporada</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { value: 'A', label: 'Carrera A', desc: 'Objetivo principal — taper completo, máxima preparación' },
                      { value: 'B', label: 'Carrera B', desc: 'Objetivo secundario — taper parcial (3–4 días)' },
                      { value: 'C', label: 'Carrera C', desc: 'Carrera de entrenamiento — sin tapering específico' },
                    ] as const).map(p => (
                      <label key={p.value} className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${racePriority === p.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-900 hover:border-lime-400/50'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="racePriority" value={p.value} checked={racePriority === p.value} onChange={() => setRacePriority(p.value)} className="accent-orange-500" />
                          <span className="font-semibold text-sm text-zinc-100">{p.label}</span>
                        </div>
                        <span className="text-xs text-zinc-500 ml-5">{p.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Previous mark and target */}
                <div className="pt-1 border-t border-zinc-800 space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={hasPreviousMark} onChange={e => setHasPreviousMark(e.target.checked)} className="accent-orange-500" />
                    <span className="font-medium">Tengo una marca previa de referencia</span>
                  </label>
                  {hasPreviousMark && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Distancia (km)</label>
                        <input type="number" step="0.1" className="w-full p-2.5 border rounded-lg bg-zinc-900 text-zinc-100 focus:ring-1 focus:ring-lime-400 focus:outline-none" value={lastRaceDistance} onChange={e => setLastRaceDistance(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Tiempo conseguido (H:MM:SS)</label>
                        <input type="text" placeholder="0:45:30" className="w-full p-2.5 border rounded-lg bg-zinc-900 text-zinc-100 placeholder-gray-400 focus:ring-1 focus:ring-lime-400 focus:outline-none" value={lastRaceTime} onChange={e => setLastRaceTime(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Tiempo objetivo (H:MM:SS)</label>
                        <input type="text" placeholder="0:42:00" className="w-full p-2.5 border rounded-lg bg-zinc-900 text-zinc-100 placeholder-gray-400 focus:ring-1 focus:ring-lime-400 focus:outline-none" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {!hasPreviousMark && (
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Tiempo objetivo (H:MM:SS) — si tienes uno</label>
                      <input type="text" placeholder="Ej: 0:45:00 para 10k" className="w-full sm:w-64 p-2.5 border rounded-lg bg-zinc-900 text-zinc-100 placeholder-gray-400 focus:ring-1 focus:ring-lime-400 focus:outline-none" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Goal text */}
                <div className="pt-1 border-t border-zinc-800">
                  <label htmlFor="goal" className="block text-sm font-medium text-zinc-200 mb-1">Tu objetivo en palabras <span className="text-red-400">*</span></label>
                  <p className="text-xs text-zinc-600 mb-2">Cuéntale al entrenador qué quieres lograr con este plan</p>
                  <input type="text" id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}
                    className="w-full p-3 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-lime-400 focus:border-lime-400 bg-zinc-900 text-zinc-100 placeholder-gray-400"
                    placeholder="Ej: Terminar mi primer maratón, mejorar 10 min mi marca, disfrutar el recorrido…"
                    required />
                </div>
              </div>

              {/* SECTION 6: Metodología */}
              <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-800">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center flex-shrink-0">6</span>
                  <h3 className="text-base font-semibold text-zinc-100">Metodología de entrenamiento</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { value: 'polarized', label: 'Polarizado', desc: '80% fácil Z1 · 20% alta intensidad. Máxima evidencia científica (Seiler).' },
                    { value: 'norwegian', label: 'Noruego',    desc: '2 sesiones de umbral/semana. Todo lo demás Z1 estricto (Ingebrigtsen).' },
                    { value: 'classic',   label: 'Clásico',    desc: 'Series martes · Tempo jueves · Largo domingo. Progresión lineal.' },
                  ] as const).map(m => (
                    <label key={m.value}
                      className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer transition-colors ${methodology === m.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-900 hover:border-lime-400/50'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="methodology" value={m.value} checked={methodology === m.value} onChange={() => setMethodology(m.value)} className="accent-orange-500" />
                        <span className="font-semibold text-sm text-zinc-100">{m.label}</span>
                      </div>
                      <span className="text-xs text-zinc-500 ml-5">{m.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Calibrated zones notice */}
              {profileZones && (
                <div className="p-3 bg-teal-950/40 border border-teal-800 rounded-lg text-sm">
                  <p className="text-teal-400 font-semibold mb-1">Zonas calibradas desde tu Strava</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {[
                      { label: 'Z1 Fácil',  sec: profileZones.z1_sec_km },
                      { label: 'Z4 Umbral', sec: profileZones.z4_sec_km },
                      { label: 'Z5 VO2max', sec: profileZones.z5_sec_km },
                    ].map(z => {
                      const mm = Math.floor(z.sec / 60);
                      const ss = Math.round(z.sec % 60).toString().padStart(2, '0');
                      return (
                        <span key={z.label} className="bg-zinc-900 border border-teal-800 rounded px-2 py-1 font-mono text-teal-400">
                          {z.label}: {mm}:{ss}/km
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mesocycle explanation */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-800 rounded-lg text-sm text-indigo-300">
                <p className="font-semibold mb-1">Plan por mesociclos</p>
                <p className="text-xs text-indigo-400">Se generará el primer mesociclo (5 semanas). Al acercarse al final de cada bloque podrás generar el siguiente, adaptado a tu progreso real.</p>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-lime-400 text-black font-bold py-4 px-6 rounded-xl hover:bg-lime-500 transition-colors disabled:bg-gray-400 text-base shadow-md">
                {loading ? 'Generando…' : 'Generar mi plan personalizado con IA'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ── Regenerate config modal ──────────────────────────── */}
      {showRegenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-zinc-100">Ajusta tu plan antes de regenerar</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Se mantendrán los entrenamientos ya completados. El nuevo plan empezará a partir de mañana.
              </p>
            </div>

            <div className="p-6 space-y-6">

              {/* Objetivo */}
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-1">Objetivo <span className="text-red-400">*</span></label>
                <input type="text" value={goal} onChange={e => setGoal(e.target.value)}
                  className="w-full p-2.5 border border-zinc-700 rounded-lg text-sm text-zinc-100 bg-zinc-800 placeholder-zinc-500 focus:ring-1 focus:ring-lime-400 focus:outline-none"
                  placeholder="Ej: Bajar mi marca de 10k, terminar maratón…" />
              </div>

              {/* Días de running */}
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-2">Días de running</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {DAY_LABELS.map((label, dow) => (
                    <button key={dow} type="button" onClick={() => toggleRunDay(dow)}
                      className={`w-11 h-11 rounded-lg text-xs font-semibold border-2 transition-colors ${
                        runDaysOfWeek.includes(dow)
                          ? 'bg-lime-400 text-black border-lime-400'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-lime-300'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {runDaysOfWeek.length === 0 && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-zinc-500">Días/semana:</label>
                    <input type="number" min={2} max={7} value={runDays}
                      onChange={e => setRunDays(Math.min(7, Math.max(2, parseInt(e.target.value) || 4)))}
                      className="w-16 p-1.5 border border-zinc-700 rounded text-sm text-center" />
                  </div>
                )}
                {runDaysOfWeek.length > 0 && (
                  <p className="text-xs text-lime-600">
                    Running los: {runDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                    <button type="button" onClick={() => setRunDaysOfWeek([])} className="ml-2 underline text-zinc-600 hover:text-zinc-400">limpiar</button>
                  </p>
                )}
              </div>

              {/* Fuerza */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-200 cursor-pointer mb-3">
                  <input type="checkbox" checked={includeStrength} onChange={e => setIncludeStrength(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                  Incluir entrenamiento de fuerza
                </label>
                {includeStrength && (
                  <div className="space-y-3 pl-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {DAY_LABELS.map((label, dow) => (
                        <button key={dow} type="button" onClick={() => toggleStrengthDay(dow)}
                          className={`w-11 h-11 rounded-lg text-xs font-semibold border-2 transition-colors ${
                            strengthDaysOfWeek.includes(dow)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-indigo-300'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {strengthDaysOfWeek.length === 0 && (
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-zinc-500">Sesiones/semana:</label>
                        {[1, 2, 3].map(n => (
                          <button key={n} type="button" onClick={() => setStrengthDaysCount(n)}
                            className={`w-9 h-9 rounded-lg text-sm font-bold border-2 transition-colors ${
                              strengthDaysCount === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-indigo-300'
                            }`}>{n}</button>
                        ))}
                      </div>
                    )}
                    {strengthDaysOfWeek.length > 0 && (
                      <p className="text-xs text-indigo-400">
                        Fuerza los: {strengthDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                        <button type="button" onClick={() => setStrengthDaysOfWeek([])} className="ml-2 underline text-zinc-600 hover:text-zinc-400">limpiar</button>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Metodología */}
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-2">Metodología</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'polarized', label: 'Polarizado', desc: '80% Z1 · 20% alta int.' },
                    { value: 'norwegian', label: 'Noruego',    desc: '2 sesiones umbral/sem' },
                    { value: 'classic',   label: 'Clásico',    desc: 'Series·Tempo·Largo' },
                  ] as const).map(m => (
                    <button key={m.value} type="button" onClick={() => setMethodology(m.value)}
                      className={`flex flex-col gap-0.5 p-2.5 rounded-lg border-2 text-left transition-colors ${methodology === m.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-900 hover:border-lime-400/50'}`}>
                      <span className="font-semibold text-xs text-zinc-100">{m.label}</span>
                      <span className="text-[10px] text-zinc-500">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tiempo objetivo */}
              <div>
                <label className="block text-sm font-medium text-zinc-200 mb-1">Tiempo objetivo (H:MM:SS)</label>
                <input type="text" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)}
                  placeholder="Ej: 3:45:00"
                  className="w-full sm:w-48 p-2.5 border border-zinc-700 rounded-lg text-sm text-zinc-100 bg-zinc-800 placeholder-zinc-500 focus:ring-1 focus:ring-lime-400 focus:outline-none font-mono" />
              </div>

            </div>

            <div className="p-6 border-t border-zinc-800 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowRegenModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-400 border border-zinc-700 hover:bg-zinc-900 transition-colors">
                Cancelar
              </button>
              <button type="button" disabled={!goal.trim()} onClick={() => { setShowRegenModal(false); handleRegenerateFromToday(); }}
                className="px-5 py-2 rounded-lg text-sm font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors disabled:opacity-50">
                Confirmar y regenerar plan
              </button>
            </div>
          </div>
        </div>
      )}

      {progressModal && <ProgressPortal message={progressMessages[progressMessageIndex]} />}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-zinc-900 rounded-xl shadow-xl max-w-sm w-full p-6 relative">
            <button onClick={() => setResultModal(null)} className="absolute top-2 right-2 text-zinc-600 hover:text-zinc-400">✕</button>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 mb-4 rounded-full flex items-center justify-center text-xl ${resultModal.success ? 'bg-green-950/60 border border-green-800 text-green-400' : 'bg-red-950/60 border border-red-800 text-red-400'}`}>
                {resultModal.success ? '✓' : '!'}
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">{resultModal.success ? 'Listo' : 'Error'}</h3>
              <p className="text-sm text-zinc-400 whitespace-pre-line">{resultModal.message}</p>
              <button onClick={() => setResultModal(null)} className="mt-6 px-4 py-2 bg-lime-400 text-black rounded-lg hover:bg-lime-500 text-sm font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <AddGoalModal
        open={showAddGoal}
        onClose={() => setShowAddGoal(false)}
        onGoalAdded={race => {
          setRaces(prev => [...prev, race].sort((a, b) => a.date.localeCompare(b.date)));
          setSelectedRace(race.id);
        }}
      />
    </main>
  );
};

export default TrainingPlanPage;
