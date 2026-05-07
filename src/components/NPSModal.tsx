import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

type Category = 'detractor' | 'passive' | 'promoter';
type Step = 'score' | 'followup' | 'thanks';

function getCategory(score: number): Category {
  if (score <= 6) return 'detractor';
  if (score <= 8) return 'passive';
  return 'promoter';
}

function getFollowUpQuestion(score: number): string {
  if (score <= 6) return '¿Qué podríamos mejorar para que Zypace encaje mejor contigo?';
  if (score <= 8) return '¿Qué necesitaría mejorar Zypace para que le pusieras un 10?';
  return '¿Qué es lo que más valoras de Zypace?';
}

function scoreColor(n: number, selected: boolean): string {
  const base =
    n <= 6  ? selected ? 'bg-red-600 border-red-500 text-white'         : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-red-950/60 hover:border-red-800 hover:text-red-300'
    : n <= 8 ? selected ? 'bg-yellow-500 border-yellow-400 text-black'   : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-yellow-950/60 hover:border-yellow-800 hover:text-yellow-300'
             : selected ? 'bg-lime-400 border-lime-300 text-black'       : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-lime-950/60 hover:border-lime-800 hover:text-lime-300';
  return `rounded-xl border text-sm font-bold py-2.5 transition-all ${base}`;
}

export default function NPSModal() {
  const { user }                       = useAuth();
  const { hasAccess }                  = useSubscription();
  const [show,     setShow]            = useState(false);
  const [step,     setStep]            = useState<Step>('score');
  const [score,    setScore]           = useState<number | null>(null);
  const [feedback, setFeedback]        = useState('');
  const [saving,   setSaving]          = useState(false);

  // Check eligibility: 14 days after registration, never shown before
  useEffect(() => {
    if (!user || !hasAccess) return;

    const check = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.data();
      if (!data) return;

      // Already answered — never show again
      if (data.nps_completed_at) return;

      // Need 14 days since account creation
      const createdAt: Date | null =
        data.created_at?.toDate?.() ?? null;
      if (!createdAt) return;

      const daysSince = (Date.now() - createdAt.getTime()) / 86_400_000;
      if (daysSince < 14) return;

      // Show after a 4-second delay so it doesn't feel jarring
      setTimeout(() => setShow(true), 4000);
    };

    check();
  }, [user, hasAccess]);

  const handleScoreSelect = (n: number) => {
    setScore(n);
    // Brief pause then go to follow-up
    setTimeout(() => setStep('followup'), 300);
  };

  const handleSubmit = async () => {
    if (!user || score === null) return;
    setSaving(true);
    try {
      const snap  = await getDoc(doc(db, 'users', user.uid));
      const email = snap.data()?.email ?? null;

      await addDoc(collection(db, 'nps_responses'), {
        uid:        user.uid,
        email,
        score,
        category:   getCategory(score),
        feedback:   feedback.trim() || null,
        created_at: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        nps_completed_at: serverTimestamp(),
      });

      setStep('thanks');
    } catch (e) {
      console.error('[NPSModal] Save error:', e);
    }
    setSaving(false);
  };

  const handleDismiss = async () => {
    // Mark as seen even if dismissed (so we don't keep pestering)
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), {
        nps_completed_at: serverTimestamp(),
      }).catch(() => {});
    }
    setShow(false);
  };

  if (!show) return null;

  const category = score !== null ? getCategory(score) : null;

  const modal = (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* ── STEP 1: Score ──────────────────────────────────────── */}
        {step === 'score' && (
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-100 leading-snug">
                ¿Con qué probabilidad nos recomendarías a un amigo corredor?
              </p>
              <button
                onClick={handleDismiss}
                className="text-zinc-600 hover:text-zinc-400 text-sm leading-none shrink-0"
              >✕</button>
            </div>

            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => handleScoreSelect(i)}
                  className={scoreColor(i, score === i)}
                >
                  {i}
                </button>
              ))}
            </div>

            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Nada probable</span>
              <span>Muy probable</span>
            </div>
          </div>
        )}

        {/* ── STEP 2: Follow-up ──────────────────────────────────── */}
        {step === 'followup' && score !== null && (
          <div className="p-5 space-y-4">
            {/* Score badge */}
            <div className="flex items-center justify-between">
              <div className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                category === 'promoter' ? 'bg-lime-950/50 text-lime-400 border-lime-800'
                : category === 'passive' ? 'bg-yellow-950/50 text-yellow-400 border-yellow-800'
                : 'bg-red-950/50 text-red-400 border-red-800'
              }`}>
                {score}/10
              </div>
              <button onClick={handleDismiss} className="text-zinc-600 hover:text-zinc-400 text-sm">✕</button>
            </div>

            <p className="text-sm font-semibold text-zinc-100 leading-snug">
              {getFollowUpQuestion(score)}
            </p>

            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Cuéntanos (opcional)…"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-lime-400 outline-none resize-none"
            />

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black rounded-xl disabled:opacity-50 transition-colors"
              >
                {saving ? 'Enviando…' : 'Enviar'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-xl transition-colors"
              >
                Omitir
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Thanks ─────────────────────────────────────── */}
        {step === 'thanks' && (
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-zinc-100">
                  {category === 'promoter' ? '¡Nos alegra mucho saberlo! 🙌'
                   : category === 'passive' ? 'Gracias por tu honestidad'
                   : 'Gracias, nos lo tomamos muy en serio'}
                </p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  {category === 'promoter'
                    ? 'Tu opinión nos impulsa a seguir mejorando.'
                    : category === 'passive'
                    ? 'Trabajaremos para merecer ese 10.'
                    : 'Tu feedback va directo al equipo. Queremos mejorar.'}
                </p>
              </div>
              <button onClick={() => setShow(false)} className="text-zinc-600 hover:text-zinc-400 text-sm shrink-0">✕</button>
            </div>

            {category === 'promoter' && (
              <a
                href="https://g.page/r/zypace/review"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-xl transition-colors"
              >
                Dejar una reseña ↗
              </a>
            )}
            {category === 'detractor' && (
              <Link
                to="/support"
                onClick={() => setShow(false)}
                className="block w-full text-center py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-xl transition-colors"
              >
                Hablar con el equipo
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
