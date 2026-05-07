import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link } from 'react-router-dom';

const fns = getFunctions(undefined, 'europe-west1');

// ── Reasons ───────────────────────────────────────────────────────────
interface Reason {
  id:               string;
  emoji:            string;
  label:            string;
  retentionTitle:   string;
  retentionBody:    string;
  hasTextInput?:    boolean;
  inputPlaceholder?: string;
  stayLabel?:       string;
  cancelLabel?:     string;
  stayHref?:        string;
}

const REASONS: Reason[] = [
  {
    id:              'not_using',
    emoji:           '🎯',
    label:           'No le estoy sacando el partido que esperaba',
    retentionTitle:  'Estamos aquí para ayudarte',
    retentionBody:   'Muchos usuarios sienten lo mismo al principio — y en una semana el calendario está lleno. ¿Qué tal si contactas con nuestro equipo? Te orientamos personalmente en menos de 24 horas y arrancamos juntos.',
    stayLabel:       'Hablar con soporte',
    stayHref:        '/support',
    cancelLabel:     'Prefiero cancelar de todas formas',
  },
  {
    id:              'price',
    emoji:           '💸',
    label:           'El precio no encaja con mi presupuesto ahora mismo',
    retentionTitle:  'Lo entendemos perfectamente',
    retentionBody:   'A veces no es el momento, y está bien. Cuando vuelvas al running con ganas de ir a por todas, aquí estaremos. Tu plan, tu historial y tus zonas de ritmo te esperarán intactos.',
    stayLabel:       'Me quedo',
    cancelLabel:     'Cancelar de todas formas',
  },
  {
    id:              'other_app',
    emoji:           '🔄',
    label:           'Prefiero usar otra aplicación',
    retentionTitle:  'La competencia nos hace mejorar',
    retentionBody:   '¿Qué tiene esa app que nosotros no tenemos todavía? Tu respuesta va directa a nuestro equipo de producto. Muchas de las funciones actuales nacieron exactamente de feedback como el tuyo.',
    hasTextInput:    true,
    inputPlaceholder: '¿Qué funcionalidad o enfoque valoras especialmente de ella?',
    stayLabel:       'Me quedo',
    cancelLabel:     'Enviar y cancelar',
  },
  {
    id:              'break',
    emoji:           '⏸️',
    label:           'Me tomo un descanso del running',
    retentionTitle:  'El descanso también es parte del plan',
    retentionBody:   'Sabemos lo que es necesitar parar. Cuando las piernas vuelvan a pedir carretera, Zypace te estará esperando exactamente donde lo dejaste.',
    stayLabel:       'Me quedo',
    cancelLabel:     'Cancelar de todas formas',
  },
  {
    id:              'missing_feature',
    emoji:           '🔧',
    label:           'Me falta una función que necesito',
    retentionTitle:  'Tu opinión construye el producto',
    retentionBody:   'Cuéntanos qué necesitas. Lo analizamos en serio y lo ponemos en el roadmap. Sin este tipo de feedback no sabríamos qué construir.',
    hasTextInput:    true,
    inputPlaceholder: '¿Qué función necesitarías para quedarte?',
    stayLabel:       'Me quedo',
    cancelLabel:     'Enviar feedback y cancelar',
  },
  {
    id:              'other',
    emoji:           '💬',
    label:           'Otro motivo',
    retentionTitle:  'Cuéntanos',
    retentionBody:   'No hay respuesta incorrecta. Cualquier cosa que compartas nos ayuda a mejorar para los próximos corredores.',
    hasTextInput:    true,
    inputPlaceholder: '¿Qué podríamos haber hecho diferente?',
    stayLabel:       'Me quedo',
    cancelLabel:     'Cancelar de todas formas',
  },
];

// ── Types ─────────────────────────────────────────────────────────────
type Step = 'reason' | 'retention' | 'confirmed';

interface ConfirmedData {
  periodEndMs: number;
  isTrial:     boolean;
}

interface Props {
  onClose:    () => void;
  onCanceled: () => void;
}

// ── Component ─────────────────────────────────────────────────────────
export default function CancellationModal({ onClose, onCanceled }: Props) {
  const [step,      setStep]      = useState<Step>('reason');
  const [selected,  setSelected]  = useState<Reason | null>(null);
  const [feedback,  setFeedback]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [confirmed, setConfirmed] = useState<ConfirmedData | null>(null);

  const handleReasonSelect = (reason: Reason) => {
    setSelected(reason);
    setFeedback('');
    setError('');
    setStep('retention');
  };

  const handleCancel = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const fn  = httpsCallable<{ reason: string; feedback?: string }, { periodEndMs: number; isTrial: boolean }>(
        fns, 'cancelSubscription',
      );
      const res = await fn({ reason: selected.id, feedback: feedback.trim() || undefined });
      setConfirmed(res.data);
      setStep('confirmed');
      onCanceled();
    } catch (e: any) {
      setError(e?.message || 'Ha ocurrido un error. Inténtalo de nuevo.');
    }
    setLoading(false);
  };

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* ── STEP 1: Reason ─────────────────────────────────────── */}
        {step === 'reason' && (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">Antes de que te vayas...</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  ¿Qué te ha llevado a tomar esta decisión? Tu respuesta nos ayuda a mejorar.
                </p>
              </div>
              <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-xl leading-none shrink-0 mt-0.5">✕</button>
            </div>

            {/* Reasons list */}
            <div className="space-y-2">
              {REASONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleReasonSelect(r)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/50 hover:border-zinc-500 hover:bg-zinc-800 transition-all group"
                >
                  <span className="text-xl shrink-0">{r.emoji}</span>
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors leading-snug">
                    {r.label}
                  </span>
                  <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors ml-auto shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Footer */}
            <p className="text-xs text-zinc-600 text-center pt-1">
              ¿Tienes una duda que podamos resolver?{' '}
              <Link to="/support" onClick={onClose} className="text-lime-400 hover:text-lime-300 underline underline-offset-2">
                Escríbenos
              </Link>
            </p>
          </div>
        )}

        {/* ── STEP 2: Retention ──────────────────────────────────── */}
        {step === 'retention' && selected && (
          <div className="p-6 space-y-5">
            {/* Back */}
            <button
              onClick={() => { setStep('reason'); setError(''); }}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Volver
            </button>

            {/* Selected reason badge */}
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg w-fit">
              <span className="text-base">{selected.emoji}</span>
              <span className="text-xs text-zinc-400">{selected.label}</span>
            </div>

            {/* Retention message */}
            <div>
              <h3 className="text-lg font-bold text-zinc-100 mb-2">{selected.retentionTitle}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{selected.retentionBody}</p>
            </div>

            {/* Optional text input */}
            {selected.hasTextInput && (
              <div>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder={selected.inputPlaceholder}
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-lime-400 outline-none resize-none"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            {/* Actions */}
            <div className="space-y-2 pt-1">
              {/* Stay button */}
              {selected.stayHref ? (
                <Link
                  to={selected.stayHref}
                  onClick={onClose}
                  className="flex items-center justify-center w-full py-3 text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black rounded-xl transition-colors"
                >
                  {selected.stayLabel}
                </Link>
              ) : (
                <button
                  onClick={onClose}
                  className="w-full py-3 text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black rounded-xl transition-colors"
                >
                  {selected.stayLabel ?? 'Me quedo'}
                </button>
              )}

              {/* Cancel anyway — intentionally subtle */}
              <button
                onClick={handleCancel}
                disabled={loading}
                className="w-full py-2.5 text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all disabled:opacity-50"
              >
                {loading ? 'Procesando…' : (selected.cancelLabel ?? 'Cancelar de todas formas')}
              </button>
            </div>

            <p className="text-[11px] text-zinc-700 text-center">
              Si cancelas, seguirás teniendo acceso hasta el final de tu periodo actual.
            </p>
          </div>
        )}

        {/* ── STEP 3: Confirmed ──────────────────────────────────── */}
        {step === 'confirmed' && confirmed && (
          <div className="p-6 space-y-5 text-center">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-3xl">
                👋
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">
                {confirmed.isTrial ? 'Cancelado. Sin cargos.' : 'Hasta pronto'}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {confirmed.isTrial
                  ? 'Has cancelado durante el periodo de prueba. No se ha realizado ningún cargo en tu cuenta.'
                  : <>Tu suscripción seguirá activa hasta el <strong className="text-zinc-200">{formatDate(confirmed.periodEndMs)}</strong>. Hasta entonces, tienes acceso completo a todo.</>
                }
              </p>
            </div>

            <p className="text-sm text-zinc-500 leading-relaxed">
              Ojalá que la próxima carrera salga redonda. Y si en algún momento quieres volver, la puerta siempre estará abierta.
            </p>

            <p className="text-xs text-zinc-600">
              Te hemos enviado un email con todos los detalles.
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl border border-zinc-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
