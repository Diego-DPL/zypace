import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection, getDocs, doc, getDoc, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseClient';
import { Race } from '../types';
import WeeklyAnalysis from './WeeklyAnalysis';

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
  total_weeks?: number | null;
  mesocycle_number?: number | null;
  mesocycle_length_weeks?: number | null;
  mesocycle_start_date?: string | null;
  mesocycle_end_date?: string | null;
  total_mesocycles?: number | null;
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Props {
  open: boolean;
  onClose: () => void;
  raceId: string;
  race: Race | null;
  onPlanChanged: () => void;
}

const PlanManagerModal = ({ open, onClose, raceId, race, onPlanChanged }: Props) => {
  const { user } = useAuth();

  // ── Plan state ────────────────────────────────────────────────
  const [plan, setPlan]                 = useState<TrainingPlan | null>(null);
  const [planMeta, setPlanMeta]         = useState<any | null>(null);
  const [loadingPlan, setLoadingPlan]   = useState(false);
  const [versions, setVersions]         = useState<any[]>([]);
  const [mesoHistory, setMesoHistory]   = useState<any[]>([]);
  const [versionPreview, setVersionPreview] = useState<any | null>(null);

  // ── Form state ────────────────────────────────────────────────
  const [goal, setGoal]                 = useState('');
  const [runDays, setRunDays]           = useState(4);
  const [runDaysOfWeek, setRunDaysOfWeek] = useState<number[]>([]);
  const [includeStrength, setIncludeStrength] = useState(false);
  const [strengthDaysCount, setStrengthDaysCount] = useState(2);
  const [strengthDaysOfWeek, setStrengthDaysOfWeek] = useState<number[]>([]);
  const [hasPreviousMark, setHasPreviousMark] = useState(false);
  const [lastRaceDistance, setLastRaceDistance] = useState('');
  const [lastRaceTime, setLastRaceTime] = useState('');
  const [targetRaceTime, setTargetRaceTime] = useState('');
  const [methodology, setMethodology]   = useState<'polarized' | 'norwegian' | 'classic'>('polarized');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'elite'>('intermediate');
  const [ageRange, setAgeRange]         = useState('30-39');
  const [currentWeeklyKm, setCurrentWeeklyKm] = useState(30);
  const [longestRecentRunKm, setLongestRecentRunKm] = useState(12);
  const [maxSessionMinutes, setMaxSessionMinutes] = useState(90);
  const [preferredTrainingTime, setPreferredTrainingTime] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('any');
  const [hasRecentInjury, setHasRecentInjury] = useState(false);
  const [recentInjuryDetail, setRecentInjuryDetail] = useState('');
  const [injuryAreas, setInjuryAreas]   = useState<string[]>([]);
  const [raceTerrain, setRaceTerrain]   = useState<'road' | 'trail' | 'mixed' | 'track'>('road');
  const [racePriority, setRacePriority] = useState<'A' | 'B' | 'C'>('A');
  const [profileZones, setProfileZones] = useState<{ z1_sec_km: number; z4_sec_km: number; z5_sec_km: number } | null>(null);

  // ── Action loading state ──────────────────────────────────────
  const [loading, setLoading]               = useState(false);
  const [loadingNextMeso, setLoadingNextMeso] = useState(false);

  // ── Profile collapse state ────────────────────────────────────
  const [profileExists, setProfileExists]   = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);

  // ── UI state ──────────────────────────────────────────────────
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [progressModal, setProgressModal]   = useState(false);
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);
  const [resultModal, setResultModal]       = useState<{ success: boolean; message: string } | null>(null);

  const progressMessages = [
    'Analizando tu carrera y objetivo…',
    'Calculando distribución semanal óptima…',
    'Ajustando cargas y descansos…',
    'Seleccionando intensidades adecuadas…',
    'Generando explicaciones de cada sesión…',
    'Casi listo, preparando tu mesociclo…',
  ];

  useEffect(() => {
    if (!progressModal) return;
    const id = setInterval(() => {
      setProgressMessageIndex(i => (i + 1) % progressMessages.length);
    }, 2500);
    return () => clearInterval(id);
  }, [progressModal]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Helpers ───────────────────────────────────────────────────
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

  const toggleRunDay      = (dow: number) => setRunDaysOfWeek(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort());
  const toggleStrengthDay = (dow: number) => setStrengthDaysOfWeek(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort());
  const toggleInjuryArea  = (area: string) => setInjuryAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);

  // ── Fetch plan ────────────────────────────────────────────────
  const fetchPlan = useCallback(async () => {
    if (!user || !raceId) return;
    setLoadingPlan(true);
    setPlan(null);
    setMesoHistory([]);
    setVersions([]);
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

      // Restore form fields from plan
      if (planData.goal)                    setGoal(planData.goal as string);
      if (planData.run_days_per_week)       setRunDays(Number(planData.run_days_per_week));
      if (Array.isArray(planData.run_days_of_week)) setRunDaysOfWeek(planData.run_days_of_week as number[]);
      setIncludeStrength(!!planData.include_strength);
      if (Array.isArray(planData.strength_days_of_week)) setStrengthDaysOfWeek(planData.strength_days_of_week as number[]);
      if (planData.strength_days_per_week)  setStrengthDaysCount(Number(planData.strength_days_per_week));
      if (planData.methodology)             setMethodology(planData.methodology as 'polarized' | 'norwegian' | 'classic');
      if (planData.last_race_distance_km)   { setHasPreviousMark(true); setLastRaceDistance(String(planData.last_race_distance_km)); }
      if (planData.last_race_time_sec)      setLastRaceTime(secsToTimeStr(planData.last_race_time_sec as number));
      if (planData.target_race_time_sec)    setTargetRaceTime(secsToTimeStr(planData.target_race_time_sec as number));

      const versSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plan_versions'), where('plan_id', '==', planId), orderBy('generated_at', 'desc'))
      );
      setVersions(versSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const histSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'mesocycle_history'), where('plan_id', '==', planId), orderBy('mesocycle_number', 'asc'))
      );
      setMesoHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn('Error loading plan in modal:', e);
    } finally {
      setLoadingPlan(false);
    }
  }, [user, raceId]);

  // Fetch user profile to pre-fill form
  const fetchUserProfile = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.z1_pace_sec_km && d.z4_pace_sec_km && d.z5_pace_sec_km) {
      setProfileZones({ z1_sec_km: d.z1_pace_sec_km, z4_sec_km: d.z4_pace_sec_km, z5_sec_km: d.z5_pace_sec_km });
    }
    if (d.runner_experience_level) {
      setExperienceLevel(d.runner_experience_level);
      setProfileExists(true);
    }
    if (d.runner_age_range)               setAgeRange(d.runner_age_range);
    if (d.runner_current_weekly_km)       setCurrentWeeklyKm(Number(d.runner_current_weekly_km));
    if (d.runner_longest_recent_run_km)   setLongestRecentRunKm(Number(d.runner_longest_recent_run_km));
    if (d.runner_max_session_minutes)     setMaxSessionMinutes(Number(d.runner_max_session_minutes));
    if (d.runner_preferred_training_time) setPreferredTrainingTime(d.runner_preferred_training_time);
    if (typeof d.runner_has_recent_injury === 'boolean') setHasRecentInjury(d.runner_has_recent_injury);
    if (d.runner_recent_injury_detail)    setRecentInjuryDetail(d.runner_recent_injury_detail || '');
    if (Array.isArray(d.runner_injury_areas)) setInjuryAreas(d.runner_injury_areas);
  }, [user]);

  useEffect(() => {
    if (open && raceId) {
      setProfileExists(false);
      setProfileExpanded(false);
      fetchPlan();
      fetchUserProfile();
    }
  }, [open, raceId, fetchPlan, fetchUserProfile]);

  // ── Plan actions ──────────────────────────────────────────────
  const handleGeneratePlan = async () => {
    if (!user || !race) return;
    try {
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
      if (!functionResponse?.plan) throw new Error('Respuesta inválida de la IA');

      // Delete old plan for this race
      const oldPlanSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plans'), where('race_id', '==', raceId))
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
        race_id:                    raceId,
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
          plan_id: planRef.id, workout_date: w.date, description: desc,
          distance_km: dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
          duration_min: tMatch ? parseInt(tMatch[1], 10) : null,
          explanation_json: w.explanation || null, is_completed: false, created_at: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'users', user.uid, 'training_plan_versions'), {
        plan_id: planRef.id, race_id: raceId, goal,
        model: meta.model || null, used_fallback: meta.fallback ?? null,
        plan_json: { workouts: functionResponse.plan }, generated_at: serverTimestamp(),
      });

      await setDoc(doc(db, 'users', user.uid), {
        runner_experience_level: experienceLevel, runner_age_range: ageRange,
        runner_current_weekly_km: currentWeeklyKm, runner_longest_recent_run_km: longestRecentRunKm,
        runner_max_session_minutes: maxSessionMinutes, runner_preferred_training_time: preferredTrainingTime,
        runner_has_recent_injury: hasRecentInjury,
        runner_recent_injury_detail: hasRecentInjury ? recentInjuryDetail : null,
        runner_injury_areas: injuryAreas.length > 0 ? injuryAreas : [],
        runner_profile_updated_at: serverTimestamp(),
      }, { merge: true });

      await fetchPlan();
      setPlanMeta(functionResponse.meta || null);
      onPlanChanged();
      window.dispatchEvent(new Event('workouts-changed'));
      setResultModal({ success: true, message: `¡Mesociclo 1${meta.total_mesocycles > 1 ? ` de ${meta.total_mesocycles}` : ''} generado! Cubre las próximas ${meta.mesocycle_length_weeks || 5} semanas.` });
    } catch (error) {
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
      await fetchPlan();
      onPlanChanged();
      window.dispatchEvent(new Event('workouts-changed'));
      setResultModal({
        success: true,
        message: `Mesociclo ${data.mesocycle_number} generado: ${data.mesocycle_start} → ${data.mesocycle_end} · ${data.workouts_added} entrenamientos añadidos.`,
      });
    } catch (err: any) {
      setResultModal({ success: false, message: `Error generando mesociclo: ${err.message || err}` });
    } finally {
      setLoadingNextMeso(false);
      setProgressModal(false);
    }
  };

  const handleRegenerateFromToday = async () => {
    if (!user || !plan || !race) return;
    setLoading(true);
    setProgressModal(true);
    setProgressMessageIndex(0);
    try {
      const generatePlanFn = httpsCallable(functions, 'generatePlan');
      const res = await generatePlanFn({
        race,
        goal: goal || plan.goal,
        config: {
          run_days_per_week: runDays,
          run_days_of_week: runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
          include_strength: includeStrength,
          strength_days_of_week: includeStrength && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
          strength_days_per_week: includeStrength ? (strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek.length : strengthDaysCount) : 0,
          last_race: hasPreviousMark ? { distance_km: parseFloat(lastRaceDistance) || null, time: lastRaceTime || null, time_seconds: parseTimeToSeconds(lastRaceTime) } : null,
          target_time: targetRaceTime || null, target_time_seconds: parseTimeToSeconds(targetRaceTime),
          methodology, stored_zones: profileZones || undefined,
          experience_level: experienceLevel, age_range: ageRange,
          current_weekly_km: currentWeeklyKm, longest_recent_run_km: longestRecentRunKm,
          max_session_minutes: maxSessionMinutes, preferred_training_time: preferredTrainingTime,
          has_recent_injury: hasRecentInjury, recent_injury_detail: hasRecentInjury ? recentInjuryDetail : null,
          injury_areas: injuryAreas.length > 0 ? injuryAreas : null,
          race_terrain: raceTerrain, race_priority: racePriority,
        },
      });

      const functionResponse = res.data as any;
      if (!functionResponse?.plan) throw new Error('Respuesta IA inválida');
      const meta = functionResponse.meta || {};

      await addDoc(collection(db, 'users', user.uid, 'training_plan_versions'), {
        plan_id: plan.id, race_id: raceId, goal: plan.goal,
        model: plan.model, used_fallback: plan.used_fallback,
        plan_json: { workouts: plan.workouts }, generated_at: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', user.uid, 'training_plans', plan.id), {
        model: meta.model || null, used_fallback: meta.fallback ?? null, openai_error: meta.openAiError || null,
        total_weeks: meta.total_weeks || null, total_mesocycles: meta.total_mesocycles || null,
        mesocycle_number: meta.mesocycle_number || 1, mesocycle_length_weeks: meta.mesocycle_length_weeks || 5,
        mesocycle_start_date: meta.mesocycle_start_date || null, mesocycle_end_date: meta.mesocycle_end_date || null,
      });

      const todayISO    = new Date().toISOString().substring(0, 10);
      const tomorrowISO = new Date(Date.now() + 86400000).toISOString().substring(0, 10);
      const futureSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', plan.id), where('workout_date', '>=', tomorrowISO))
      );
      for (const w of futureSnap.docs) { await deleteDoc(w.ref); }

      const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
      const durRegex  = /(\d{1,3})\s?(?:min|mins|m)\b/i;
      for (const w of functionResponse.plan) {
        if (w.date <= todayISO) continue;
        const desc: string = w.description || '';
        const dMatch = desc.match(distRegex);
        const tMatch = desc.match(durRegex);
        await addDoc(collection(db, 'users', user.uid, 'workouts'), {
          plan_id: plan.id, workout_date: w.date, description: desc,
          distance_km: dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
          duration_min: tMatch ? parseInt(tMatch[1], 10) : null,
          explanation_json: w.explanation || null, is_completed: false, created_at: serverTimestamp(),
        });
      }

      await setDoc(doc(db, 'users', user.uid), {
        runner_experience_level: experienceLevel, runner_age_range: ageRange,
        runner_current_weekly_km: currentWeeklyKm, runner_longest_recent_run_km: longestRecentRunKm,
        runner_max_session_minutes: maxSessionMinutes, runner_preferred_training_time: preferredTrainingTime,
        runner_has_recent_injury: hasRecentInjury, runner_recent_injury_detail: hasRecentInjury ? recentInjuryDetail : null,
        runner_injury_areas: injuryAreas.length > 0 ? injuryAreas : [], runner_profile_updated_at: serverTimestamp(),
      }, { merge: true });

      await fetchPlan();
      setPlanMeta(functionResponse.meta || null);
      onPlanChanged();
      window.dispatchEvent(new Event('workouts-changed'));
      setResultModal({ success: true, message: 'Mesociclo regenerado desde hoy.' });
    } catch (err: any) {
      setResultModal({ success: false, message: `Error regenerando: ${err.message || err}` });
    } finally {
      setLoading(false);
      setProgressModal(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!user || !plan) return;
    if (!window.confirm('¿Eliminar este plan? Esta acción no se puede deshacer.')) return;
    setLoading(true);
    try {
      const workoutsSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', plan.id))
      );
      for (const w of workoutsSnap.docs) { await deleteDoc(w.ref); }
      await deleteDoc(doc(db, 'users', user.uid, 'training_plans', plan.id));
      setPlan(null);
      setGoal('');
      onPlanChanged();
    } catch (e) {
      console.error('Error deleting plan:', e);
    } finally {
      setLoading(false);
    }
  };

  const startGeneration = () => {
    if (!user || !race || loading) return;
    setProgressMessageIndex(0);
    setProgressModal(true);
    setLoading(true);
    void handleGeneratePlan();
  };

  const handleLoadVersion = async (versionId: string) => {
    if (!user || !plan) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'training_plan_versions', versionId));
      if (snap.exists()) setVersionPreview({ id: snap.id, ...snap.data() });
    } catch { /* ignore */ }
  };

  // ── Derived values ────────────────────────────────────────────
  const todayISO = new Date().toISOString().substring(0, 10);
  const mesoEnd  = plan?.mesocycle_end_date;
  const daysUntilMesoEnd = mesoEnd
    ? Math.ceil((new Date(mesoEnd).getTime() - new Date(todayISO).getTime()) / 86400000)
    : null;
  const canGenerateNextMeso = plan &&
    (plan.total_mesocycles ?? 1) > (plan.mesocycle_number ?? 1) &&
    daysUntilMesoEnd !== null && daysUntilMesoEnd <= 14;

  const ProgressPortal = ({ message }: { message: string }) => {
    const content = (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
        <div className="bg-zinc-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-700" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-lime-400 animate-spin" />
            <div className="absolute inset-2 rounded-full bg-lime-400/10 animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Generando mesociclo</h3>
          <p className="text-sm text-zinc-200 font-medium min-h-[44px] leading-relaxed px-1">{message}</p>
          <p className="mt-3 text-[11px] text-zinc-500">Puede tardar un momento. No cierres esta pestaña.</p>
        </div>
      </div>
    );
    try { return createPortal(content, document.body); }
    catch { return content; }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !progressModal) onClose(); }}
    >
      <div className="bg-zinc-950 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col border border-zinc-800">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {plan ? 'Gestionar plan' : 'Crear plan'}{race ? ` — ${race.name}` : ''}
            </h2>
            {race && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {new Date(race.date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors text-lg"
          >✕</button>
        </div>

        {/* Modal body - scrollable */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {loadingPlan && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
              <div className="w-4 h-4 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
              Cargando…
            </div>
          )}

          {/* ── PLAN EXISTS: management view ── */}
          {!loadingPlan && plan && (
            <div className="space-y-5">

              {/* Plan header + actions */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm text-zinc-400">Objetivo: {plan.goal}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowRegenModal(true)} disabled={loading}
                    className="px-3 py-1.5 bg-lime-400 text-black font-semibold rounded-lg hover:bg-lime-500 text-sm transition-colors disabled:opacity-50">
                    Regenerar
                  </button>
                  <button onClick={handleDeletePlan} disabled={loading}
                    className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-red-400 hover:bg-red-950/40 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50">
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Mesocycle progress */}
              {plan.mesocycle_number && (
                <div className="p-4 bg-indigo-950/40 border border-indigo-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <span className="text-sm font-semibold text-indigo-300">
                      Mesociclo {plan.mesocycle_number}{plan.total_mesocycles ? ` de ${plan.total_mesocycles}` : ''}
                    </span>
                    {daysUntilMesoEnd !== null && daysUntilMesoEnd > 0 && daysUntilMesoEnd <= 21 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${daysUntilMesoEnd <= 7 ? 'bg-lime-400/10 border-lime-400/30 text-lime-400' : 'bg-indigo-900/40 border-indigo-800 text-indigo-400'}`}>
                        Faltan {daysUntilMesoEnd} días
                      </span>
                    )}
                  </div>
                  {plan.mesocycle_start_date && plan.mesocycle_end_date && (
                    <p className="text-xs text-indigo-400 mb-2">
                      {new Date(plan.mesocycle_start_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      {' → '}
                      {new Date(plan.mesocycle_end_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                  {plan.total_mesocycles && plan.total_mesocycles > 1 && (
                    <div className="flex gap-1 mb-3">
                      {Array.from({ length: plan.total_mesocycles }).map((_, i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full ${i + 1 < plan.mesocycle_number! ? 'bg-indigo-500' : i + 1 === plan.mesocycle_number ? 'bg-indigo-400' : 'bg-zinc-700'}`} />
                      ))}
                    </div>
                  )}
                  {(() => {
                    const allTrain = plan.workouts.filter(w => !/descanso|rest/i.test(w.description));
                    const done = allTrain.filter(w => w.is_completed);
                    if (!allTrain.length) return null;
                    const pct = Math.round(done.length / allTrain.length * 100);
                    return (
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500">{done.length}/{allTrain.length}</span>
                      </div>
                    );
                  })()}
                  {canGenerateNextMeso && (
                    <button onClick={handleGenerateNextMesocycle} disabled={loadingNextMeso}
                      className="w-full sm:w-auto bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm transition-colors disabled:opacity-50">
                      {loadingNextMeso ? 'Generando…' : `Generar mesociclo ${(plan.mesocycle_number || 1) + 1}`}
                    </button>
                  )}
                  {(plan.total_mesocycles ?? 1) > (plan.mesocycle_number ?? 1) && !canGenerateNextMeso && daysUntilMesoEnd !== null && daysUntilMesoEnd > 14 && (
                    <p className="text-xs text-indigo-400">El botón para generar el siguiente mesociclo aparecerá 2 semanas antes del final del actual.</p>
                  )}
                </div>
              )}

              {/* Training zones */}
              {planMeta?.zones && (
                <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Zonas de entrenamiento</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      { label: 'Z1 Fácil',  value: planMeta.zones.z1,   cls: 'bg-green-950/50 border-green-800 text-green-400' },
                      { label: 'Z4 Umbral', value: planMeta.zones.z4,   cls: 'bg-yellow-950/50 border-yellow-800 text-yellow-400' },
                      { label: 'Z5 VO2max', value: planMeta.zones.z5,   cls: 'bg-red-950/50 border-red-800 text-red-400' },
                      { label: 'Objetivo',  value: planMeta.zones.race, cls: 'bg-purple-950/50 border-purple-800 text-purple-400' },
                    ].map(z => (
                      <div key={z.label} className={`border rounded-lg p-2 text-center ${z.cls}`}>
                        <div className="font-semibold">{z.label}</div>
                        <div className="font-mono mt-0.5">{z.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Meso history */}
              {mesoHistory.length > 0 && (
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Historial de mesociclos</h3>
                  <div className="space-y-1.5">
                    {mesoHistory.map((h: any) => {
                      const adh = h.adherence_pct ?? null;
                      return (
                        <div key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800">
                          <span className="font-semibold text-indigo-400 w-16 shrink-0">Meso {h.mesocycle_number}</span>
                          <span className="text-zinc-500">
                            {h.start_date ? new Date(h.start_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'}
                            {' → '}
                            {h.end_date ? new Date(h.end_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'}
                          </span>
                          {adh !== null && <span className={adh >= 80 ? 'text-green-500' : adh >= 60 ? 'text-amber-500' : 'text-red-500'}>{adh}% adh.</span>}
                          {h.total_km > 0 && <span className="text-zinc-400">{h.total_km} km</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Versions */}
              {versions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Versiones anteriores</h3>
                  <ul className="space-y-1.5 text-xs">
                    {versions.map(v => (
                      <li key={v.id}
                        className="flex items-center justify-between border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-900 cursor-pointer hover:bg-zinc-800"
                        onClick={() => handleLoadVersion(v.id)}>
                        <span className="text-zinc-400">{v.generated_at?.toDate ? v.generated_at.toDate().toLocaleString() : '—'}</span>
                        <span className="text-zinc-600">Ver →</span>
                      </li>
                    ))}
                  </ul>
                  {versionPreview && (
                    <div className="mt-3 border border-zinc-700 rounded-lg p-4 bg-zinc-900">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-zinc-300">Versión del {versionPreview.generated_at?.toDate ? versionPreview.generated_at.toDate().toLocaleString() : '—'}</span>
                        <button onClick={() => setVersionPreview(null)} className="text-xs text-zinc-500 hover:text-zinc-200">Cerrar</button>
                      </div>
                      <ul className="space-y-1 max-h-48 overflow-auto text-xs text-zinc-400">
                        {(versionPreview.plan_json?.workouts || []).map((w: any, idx: number) => (
                          <li key={idx} className="border-b border-zinc-800 pb-1">
                            <span className="font-medium text-zinc-300">{w.date || w.workout_date}</span>: {w.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Weekly analysis */}
              <WeeklyAnalysis planId={plan.id} onWorkoutsChanged={fetchPlan} />
            </div>
          )}

          {/* ── NO PLAN: generation form ── */}
          {!loadingPlan && !plan && (
            <div>
              <div className="mb-5">
                <h3 className="text-base font-semibold text-zinc-100 mb-1">Configura tu plan personalizado</h3>
                <p className="text-xs text-zinc-500">Completa tu perfil para generar un plan completamente adaptado a ti.</p>
              </div>

              <form onSubmit={e => { e.preventDefault(); startGeneration(); }} className="space-y-4">

                {/* Profile summary strip (returning users) */}
                {profileExists && !profileExpanded && (
                  <div className="border border-zinc-700 rounded-xl px-4 py-3 bg-zinc-900 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-0.5">Perfil del corredor</p>
                      <p className="text-sm text-zinc-200">
                        {experienceLevel === 'beginner' ? 'Principiante' : experienceLevel === 'intermediate' ? 'Intermedio' : experienceLevel === 'advanced' ? 'Avanzado' : 'Élite'}
                        {' · '}{ageRange}
                        {' · '}{currentWeeklyKm} km/sem
                        {hasRecentInjury && <span className="text-red-400 ml-1.5">· Lesión activa</span>}
                      </p>
                    </div>
                    <button type="button" onClick={() => setProfileExpanded(true)}
                      className="text-xs text-lime-400 hover:text-lime-300 underline shrink-0">
                      Editar
                    </button>
                  </div>
                )}

                {/* Sections 1-4: full profile form (first-time or expanded) */}
                {(!profileExists || profileExpanded) && (
                  <>
                {/* Section 1: Perfil del corredor */}
                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center shrink-0">1</span>
                    <h4 className="text-sm font-semibold text-zinc-100">Tu perfil como corredor</h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">Nivel de experiencia</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {([
                          { value: 'beginner',     label: 'Principiante',    desc: '< 1 año' },
                          { value: 'intermediate', label: 'Intermedio',      desc: '1–3 años' },
                          { value: 'advanced',     label: 'Avanzado',        desc: '3+ años' },
                          { value: 'elite',        label: 'Élite',           desc: 'Alto volumen' },
                        ] as const).map(lvl => (
                          <label key={lvl.value} className={`flex flex-col gap-0.5 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${experienceLevel === lvl.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-950 hover:border-lime-400/50'}`}>
                            <div className="flex items-center gap-1.5">
                              <input type="radio" name="experienceLevel" value={lvl.value} checked={experienceLevel === lvl.value} onChange={() => setExperienceLevel(lvl.value)} className="accent-lime-400" />
                              <span className="font-semibold text-xs text-zinc-100">{lvl.label}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 ml-4">{lvl.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">Rango de edad</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['18-29', '30-39', '40-49', '50-59', '60+'].map(r => (
                          <button key={r} type="button" onClick={() => setAgeRange(r)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${ageRange === r ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-lime-400'}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Volumen actual */}
                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center shrink-0">2</span>
                    <h4 className="text-sm font-semibold text-zinc-100">Tu entrenamiento actual</h4>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">Km por semana actualmente</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[{ label: '< 20 km', value: 15 }, { label: '20–40', value: 30 }, { label: '40–60', value: 50 }, { label: '60–80', value: 70 }, { label: '80–100', value: 90 }, { label: '> 100', value: 110 }].map(opt => (
                          <button key={opt.value} type="button" onClick={() => setCurrentWeeklyKm(opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${currentWeeklyKm === opt.value ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-lime-400'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">Rodaje largo reciente</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[{ label: '< 10 km', value: 8 }, { label: '10–15', value: 12 }, { label: '15–20', value: 17 }, { label: '20–25', value: 22 }, { label: '25–32', value: 28 }, { label: '> 32', value: 35 }].map(opt => (
                          <button key={opt.value} type="button" onClick={() => setLongestRecentRunKm(opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${longestRecentRunKm === opt.value ? 'bg-blue-500 text-white border-blue-500' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-blue-400'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">Tiempo máximo por sesión</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[{ label: '45 min', value: 45 }, { label: '60 min', value: 60 }, { label: '75 min', value: 75 }, { label: '90 min', value: 90 }, { label: '2 h', value: 120 }, { label: '2h 30+', value: 150 }].map(opt => (
                          <button key={opt.value} type="button" onClick={() => setMaxSessionMinutes(opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${maxSessionMinutes === opt.value ? 'bg-teal-500 text-white border-teal-500' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-teal-400'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Disponibilidad */}
                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center shrink-0">3</span>
                    <h4 className="text-sm font-semibold text-zinc-100">Disponibilidad semanal</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">Días de running</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={2} max={7} value={runDaysOfWeek.length > 0 ? runDaysOfWeek.length : runDays}
                        onChange={e => { setRunDays(parseInt(e.target.value, 10)); setRunDaysOfWeek([]); }}
                        className="w-16 p-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 text-sm text-center" />
                      <span className="text-xs text-zinc-500">días/semana</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-600 mb-1.5">Días específicos (opcional)</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAY_LABELS.map((label, dow) => (
                          <button key={dow} type="button" onClick={() => toggleRunDay(dow)}
                            className={`w-11 h-11 rounded-lg text-xs font-semibold border-2 transition-colors ${runDaysOfWeek.includes(dow) ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-lime-400'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      {runDaysOfWeek.length > 0 && (
                        <p className="text-xs text-lime-600 mt-1">
                          Running los: {runDaysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
                          <button type="button" onClick={() => setRunDaysOfWeek([])} className="ml-2 underline text-zinc-500">limpiar</button>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-zinc-800">
                    <label className="flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer mb-2">
                      <input type="checkbox" checked={includeStrength} onChange={e => setIncludeStrength(e.target.checked)} className="accent-indigo-600" />
                      <span className="text-indigo-400">Incluir entrenamiento de fuerza</span>
                    </label>
                    {includeStrength && (
                      <div className="space-y-2 pl-1">
                        <div className="flex gap-1.5">
                          {DAY_LABELS.map((label, dow) => (
                            <button key={dow} type="button" onClick={() => toggleStrengthDay(dow)}
                              className={`w-11 h-11 rounded-lg text-xs font-semibold border-2 transition-colors ${strengthDaysOfWeek.includes(dow) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-indigo-400'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {strengthDaysOfWeek.length === 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Sesiones/sem:</span>
                            {[1, 2, 3].map(n => (
                              <button key={n} type="button" onClick={() => { setStrengthDaysCount(n); setStrengthDaysOfWeek([]); }}
                                className={`w-9 h-9 rounded-lg text-sm font-bold border-2 transition-colors ${strengthDaysCount === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-indigo-400'}`}>
                                {n}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-zinc-800">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Momento preferido para entrenar</label>
                    <div className="flex flex-wrap gap-1.5">
                      {([['morning','Mañana'],['afternoon','Tarde'],['evening','Noche'],['any','Flexible']] as const).map(([v, label]) => (
                        <button key={v} type="button" onClick={() => setPreferredTrainingTime(v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${preferredTrainingTime === v ? 'bg-amber-500 text-white border-amber-500' : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-amber-400'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section 4: Lesiones */}
                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center shrink-0">4</span>
                    <h4 className="text-sm font-semibold text-zinc-100">Lesiones y limitaciones</h4>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={hasRecentInjury} onChange={e => setHasRecentInjury(e.target.checked)} className="accent-red-500" />
                    <span className="text-zinc-300">Tengo lesión reciente activa (últimas 8 semanas)</span>
                  </label>
                  {hasRecentInjury && (
                    <input type="text" value={recentInjuryDetail} onChange={e => setRecentInjuryDetail(e.target.value)}
                      placeholder="Describe brevemente (ej: tendinitis aquíleo izquierdo, en recuperación)"
                      className="w-full p-2 border border-red-800 rounded-lg text-xs bg-zinc-950 text-zinc-100 placeholder-zinc-600" />
                  )}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Zonas de atención crónicas</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['Rodillas', 'Talón de Aquiles', 'Cintilla IT', 'Fascitis plantar', 'Cadera / glúteo', 'Espalda baja', 'Tibias', 'Sin lesiones'].map(area => (
                        <button key={area} type="button" onClick={() => toggleInjuryArea(area)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-colors ${injuryAreas.includes(area) ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:border-red-400'}`}>
                          {area}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {profileExpanded && (
                  <button type="button" onClick={() => setProfileExpanded(false)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 underline w-full text-right pr-1">
                    Ocultar perfil ↑
                  </button>
                )}
                  </>
                )}

                {/* Section 5: Objetivo */}
                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center shrink-0">5</span>
                    <h4 className="text-sm font-semibold text-zinc-100">Objetivo y datos de la carrera</h4>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Tipo de terreno</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {([['road','Asfalto'],['trail','Trail'],['mixed','Mixto'],['track','Pista']] as const).map(([v, label]) => (
                        <label key={v} className={`flex items-center gap-1.5 p-2 rounded-lg border-2 cursor-pointer transition-colors ${raceTerrain === v ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-950 hover:border-lime-400/50'}`}>
                          <input type="radio" name="terrain" value={v} checked={raceTerrain === v} onChange={() => setRaceTerrain(v)} className="accent-lime-400" />
                          <span className="text-xs font-semibold text-zinc-100">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Prioridad de esta carrera</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { value: 'A', label: 'Carrera A', desc: 'Objetivo principal' },
                        { value: 'B', label: 'Carrera B', desc: 'Objetivo secundario' },
                        { value: 'C', label: 'Carrera C', desc: 'Entrenamiento' },
                      ] as const).map(p => (
                        <label key={p.value} className={`flex flex-col gap-0.5 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${racePriority === p.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-950 hover:border-lime-400/50'}`}>
                          <div className="flex items-center gap-1.5">
                            <input type="radio" name="priority" value={p.value} checked={racePriority === p.value} onChange={() => setRacePriority(p.value)} className="accent-lime-400" />
                            <span className="font-semibold text-xs text-zinc-100">{p.label}</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 ml-4">{p.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 space-y-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={hasPreviousMark} onChange={e => setHasPreviousMark(e.target.checked)} className="accent-orange-500" />
                      <span className="text-zinc-300 font-medium">Tengo una marca previa de referencia</span>
                    </label>
                    {hasPreviousMark ? (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">Distancia (km)</label>
                          <input type="number" step="0.1" value={lastRaceDistance} onChange={e => setLastRaceDistance(e.target.value)}
                            className="w-full p-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 text-sm" />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">Tiempo logrado</label>
                          <input type="text" placeholder="0:45:30" value={lastRaceTime} onChange={e => setLastRaceTime(e.target.value)}
                            className="w-full p-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 text-sm font-mono placeholder-zinc-600" />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">Tiempo objetivo</label>
                          <input type="text" placeholder="0:42:00" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)}
                            className="w-full p-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 text-sm font-mono placeholder-zinc-600" />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Tiempo objetivo (opcional)</label>
                        <input type="text" placeholder="Ej: 0:45:00 para 10k" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)}
                          className="w-full sm:w-56 p-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 text-sm font-mono placeholder-zinc-600" />
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-800">
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Tu objetivo en palabras <span className="text-red-400">*</span></label>
                    <input type="text" value={goal} onChange={e => setGoal(e.target.value)} required
                      className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100 text-sm placeholder-zinc-600 focus:ring-2 focus:ring-lime-400 outline-none"
                      placeholder="Ej: Terminar mi primer maratón, mejorar 10 min mi marca…" />
                  </div>
                </div>

                {/* Section 6: Metodología */}
                <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-xs font-bold flex items-center justify-center shrink-0">6</span>
                    <h4 className="text-sm font-semibold text-zinc-100">Metodología</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { value: 'polarized', label: 'Polarizado', desc: '80% Z1 · 20% alta intensidad (Seiler)' },
                      { value: 'norwegian', label: 'Noruego',    desc: '2×umbral/sem · todo lo demás Z1 (Ingebrigtsen)' },
                      { value: 'classic',   label: 'Clásico',    desc: 'Series · Tempo · Largo · Progresión lineal' },
                    ] as const).map(m => (
                      <label key={m.value} className={`flex flex-col gap-0.5 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${methodology === m.value ? 'border-lime-400 bg-lime-400/10' : 'border-zinc-700 bg-zinc-950 hover:border-lime-400/50'}`}>
                        <div className="flex items-center gap-1.5">
                          <input type="radio" name="methodology" value={m.value} checked={methodology === m.value} onChange={() => setMethodology(m.value)} className="accent-lime-400" />
                          <span className="font-semibold text-xs text-zinc-100">{m.label}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 ml-4">{m.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Zones notice */}
                {profileZones && (
                  <div className="p-3 bg-teal-950/40 border border-teal-800 rounded-lg text-xs">
                    <p className="text-teal-400 font-semibold mb-1">Zonas calibradas desde tu Strava</p>
                    <div className="flex flex-wrap gap-2">
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

                <div className="p-3 bg-indigo-950/40 border border-indigo-800 rounded-lg text-xs text-indigo-300">
                  <p className="font-semibold mb-1">Plan por mesociclos</p>
                  <p className="text-indigo-400">Se generará el primer mesociclo (5 semanas). Al acercarse al final podrás generar el siguiente, adaptado a tu progreso real.</p>
                </div>

                <button type="submit" disabled={loading || !goal.trim()}
                  className="w-full bg-lime-400 text-black font-bold py-3.5 px-6 rounded-xl hover:bg-lime-500 transition-colors disabled:opacity-50 text-sm shadow-md">
                  {loading ? 'Generando…' : 'Generar mi plan personalizado con IA'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Regen modal (fixed, above plan modal) */}
      {showRegenModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-zinc-700">
            <div className="p-5 border-b border-zinc-800">
              <h3 className="text-base font-bold text-zinc-100">Ajusta antes de regenerar</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Los entrenamientos completados se mantienen. El nuevo plan empieza desde mañana.</p>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Objetivo <span className="text-red-400">*</span></label>
                <input type="text" value={goal} onChange={e => setGoal(e.target.value)}
                  className="w-full p-2.5 border border-zinc-700 rounded-lg text-sm text-zinc-100 bg-zinc-800 placeholder-zinc-600 focus:ring-1 focus:ring-lime-400 outline-none"
                  placeholder="Ej: Bajar marca de 10k…" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">Días de running</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {DAY_LABELS.map((label, dow) => (
                    <button key={dow} type="button" onClick={() => toggleRunDay(dow)}
                      className={`w-11 h-11 rounded-lg text-xs font-semibold border-2 transition-colors ${runDaysOfWeek.includes(dow) ? 'bg-lime-400 text-black border-lime-400' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-lime-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {runDaysOfWeek.length === 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-500">Días/sem:</label>
                    <input type="number" min={2} max={7} value={runDays}
                      onChange={e => setRunDays(Math.min(7, Math.max(2, parseInt(e.target.value) || 4)))}
                      className="w-14 p-1.5 border border-zinc-700 rounded text-sm text-center bg-zinc-900 text-zinc-100" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">Metodología</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: 'polarized', label: 'Polarizado' },
                    { value: 'norwegian', label: 'Noruego' },
                    { value: 'classic',   label: 'Clásico' },
                  ] as const).map(m => (
                    <button key={m.value} type="button" onClick={() => setMethodology(m.value)}
                      className={`p-2.5 rounded-lg border-2 text-xs font-semibold transition-colors ${methodology === m.value ? 'border-lime-400 bg-lime-400/10 text-zinc-100' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-lime-400/50'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Tiempo objetivo (opcional)</label>
                <input type="text" value={targetRaceTime} onChange={e => setTargetRaceTime(e.target.value)}
                  placeholder="Ej: 3:45:00"
                  className="w-full sm:w-44 p-2 border border-zinc-700 rounded-lg text-sm text-zinc-100 bg-zinc-800 placeholder-zinc-600 focus:ring-1 focus:ring-lime-400 outline-none font-mono" />
              </div>
            </div>
            <div className="p-5 border-t border-zinc-800 flex gap-2 justify-end">
              <button onClick={() => setShowRegenModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-400 border border-zinc-700 hover:bg-zinc-900 transition-colors">
                Cancelar
              </button>
              <button disabled={!goal.trim()} onClick={() => { setShowRegenModal(false); handleRegenerateFromToday(); }}
                className="px-5 py-2 rounded-lg text-sm font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors disabled:opacity-50">
                Confirmar y regenerar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal */}
      {resultModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-zinc-900 rounded-xl shadow-xl max-w-sm w-full p-6 relative border border-zinc-700">
            <button onClick={() => setResultModal(null)} className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 text-lg">✕</button>
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 mb-4 rounded-full flex items-center justify-center text-lg ${resultModal.success ? 'bg-green-950/60 border border-green-800 text-green-400' : 'bg-red-950/60 border border-red-800 text-red-400'}`}>
                {resultModal.success ? '✓' : '!'}
              </div>
              <h3 className="text-base font-semibold text-zinc-100 mb-2">{resultModal.success ? 'Listo' : 'Error'}</h3>
              <p className="text-sm text-zinc-400">{resultModal.message}</p>
              <button onClick={() => setResultModal(null)} className="mt-5 px-4 py-2 bg-lime-400 text-black rounded-lg hover:bg-lime-500 text-sm font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {progressModal && <ProgressPortal message={progressMessages[progressMessageIndex]} />}
    </div>,
    document.body
  );
};

export default PlanManagerModal;
