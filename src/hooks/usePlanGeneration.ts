import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';

export interface RunnerProfileConfig {
  experienceLevel: string;
  ageRange: string;
  currentWeeklyKm: number;
  longestRecentRunKm: number;
  maxSessionMinutes: number;
  preferredTrainingTime: string;
  hasRecentInjury: boolean;
  recentInjuryDetail: string;
  injuryAreas: string[];
}

export interface PlanPersistConfig {
  planId: string;
  raceId: string;
  goal: string;
  runDays: number;
  runDaysOfWeek: number[];
  includeStrength: boolean;
  strengthDaysOfWeek: number[];
  strengthDaysCount: number;
  methodology: string;
  raceTerrain: string;
  hasPreviousMark: boolean;
  lastRaceDistance: string;
  lastRaceTime: string;
  targetRaceTime: string;
  parseTimeToSeconds: (t: string) => number | null;
}

const PROGRESS_MESSAGES = [
  'Analizando tu carrera y objetivo…',
  'Calculando distribución semanal óptima…',
  'Ajustando cargas y descansos…',
  'Seleccionando intensidades adecuadas…',
  'Generando explicaciones de cada sesión…',
  'Casi listo, preparando tu mesociclo…',
];

const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
const durRegex  = /(\d{1,3})\s?(?:min|mins)\b/i;

export function usePlanGeneration() {
  const [loading,               setLoading]               = useState(false);
  const [loadingNextMeso,       setLoadingNextMeso]       = useState(false);
  const [progressModal,         setProgressModal]         = useState(false);
  const [progressMessageIndex,  setProgressMessageIndex]  = useState(0);
  const [resultModal,           setResultModal]           = useState<{ success: boolean; message: string } | null>(null);

  // Cycle progress messages while modal is open
  useEffect(() => {
    if (!progressModal) return;
    const id = setInterval(() => {
      setProgressMessageIndex(i => (i + 1) % PROGRESS_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, [progressModal]);

  // Lock body scroll while progress modal is open
  useEffect(() => {
    if (progressModal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [progressModal]);

  const startProgress = useCallback(() => {
    setProgressMessageIndex(0);
    setProgressModal(true);
    setLoading(true);
  }, []);

  const stopProgress = useCallback(() => {
    setLoading(false);
    setProgressModal(false);
  }, []);

  const dismissResult = useCallback(() => setResultModal(null), []);

  // Client-side fallback: write plan doc + workouts when server didn't persist
  const persistPlanLocally = useCallback(async (
    uid: string,
    planDocId: string,
    functionResponse: any,
    meta: any,
    cfg: PlanPersistConfig,
  ) => {
    const planData = {
      race_id:                    cfg.raceId,
      goal:                       cfg.goal,
      model:                      meta.model || null,
      used_fallback:              meta.fallback ?? null,
      openai_error:               meta.openAiError || null,
      run_days_per_week:          cfg.runDays,
      run_days_of_week:           cfg.runDaysOfWeek.length > 0 ? cfg.runDaysOfWeek : null,
      include_strength:           cfg.includeStrength,
      strength_days_of_week:      cfg.includeStrength && cfg.strengthDaysOfWeek.length > 0 ? cfg.strengthDaysOfWeek : null,
      strength_days_per_week:     cfg.includeStrength ? (cfg.strengthDaysOfWeek.length > 0 ? cfg.strengthDaysOfWeek.length : cfg.strengthDaysCount) : null,
      last_race_distance_km:      cfg.hasPreviousMark ? (parseFloat(cfg.lastRaceDistance) || null) : null,
      last_race_time_sec:         cfg.hasPreviousMark ? cfg.parseTimeToSeconds(cfg.lastRaceTime) : null,
      target_race_time_sec:       cfg.parseTimeToSeconds(cfg.targetRaceTime),
      methodology:                cfg.methodology,
      race_terrain:               cfg.raceTerrain,
      total_weeks:                meta.total_weeks || null,
      total_mesocycles:           meta.total_mesocycles || null,
      mesocycle_number:           meta.mesocycle_number || 1,
      mesocycle_length_weeks:     meta.mesocycle_length_weeks || 5,
      plan_start_date:            meta.plan_start_date || meta.mesocycle_start_date || null,
      mesocycle_start_date:       meta.mesocycle_start_date || null,
      mesocycle_end_date:         meta.mesocycle_end_date || null,
      created_at:                 serverTimestamp(),
    };

    await setDoc(
      doc(db, 'users', uid, 'training_plans', planDocId),
      planData,
    );

    await Promise.all((functionResponse.plan as any[]).map((w: any) => {
      const desc: string = w.description || '';
      const dMatch = desc.match(distRegex);
      const tMatch = desc.match(durRegex);
      return addDoc(collection(db, 'users', uid, 'workouts'), {
        plan_id:          planDocId,
        workout_date:     w.date,
        description:      desc,
        distance_km:      dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
        duration_min:     tMatch ? parseInt(tMatch[1], 10) : null,
        elevation_gain_m: w.explanation?.elevation_gain_m ?? null,
        explanation_json: w.explanation || null,
        is_completed:     false,
        created_at:       serverTimestamp(),
      });
    }));
  }, []);

  // Save runner profile to user doc
  const saveRunnerProfile = useCallback(async (uid: string, profile: RunnerProfileConfig) => {
    await setDoc(doc(db, 'users', uid), {
      runner_experience_level:        profile.experienceLevel,
      runner_age_range:               profile.ageRange,
      runner_current_weekly_km:       profile.currentWeeklyKm,
      runner_longest_recent_run_km:   profile.longestRecentRunKm,
      runner_max_session_minutes:     profile.maxSessionMinutes,
      runner_preferred_training_time: profile.preferredTrainingTime,
      runner_has_recent_injury:       profile.hasRecentInjury,
      runner_recent_injury_detail:    profile.hasRecentInjury ? profile.recentInjuryDetail : null,
      runner_injury_areas:            profile.injuryAreas.length > 0 ? profile.injuryAreas : [],
      runner_profile_updated_at:      serverTimestamp(),
    }, { merge: true });
  }, []);

  return {
    // State
    loading,           setLoading,
    loadingNextMeso,   setLoadingNextMeso,
    progressModal,     setProgressModal,
    progressMessages:  PROGRESS_MESSAGES,
    progressMessageIndex,
    resultModal,
    // Helpers
    startProgress,
    stopProgress,
    dismissResult,
    setResultModal,
    persistPlanLocally,
    saveRunnerProfile,
  };
}
