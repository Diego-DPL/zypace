import { useRef } from 'react';

interface Props {
  mesocycleNumber: number;
  totalMesocycles?: number | null;
  startDate: string;
  endDate: string;
  totalKm: number;
  completedWorkouts: number;
  totalWorkouts: number;
  adherencePct: number;
  raceName?: string;
  runnerName?: string;
  onClose: () => void;
}

export default function MesocycleShareCard({
  mesocycleNumber, totalMesocycles, startDate, endDate,
  totalKm, completedWorkouts, totalWorkouts, adherencePct,
  raceName, runnerName, onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  const adherenceColor =
    adherencePct >= 80 ? 'text-lime-400' :
    adherencePct >= 60 ? 'text-yellow-400' : 'text-red-400';

  const shareText = [
    `🏃 Mesociclo ${mesocycleNumber}${totalMesocycles ? ` de ${totalMesocycles}` : ''} completado`,
    raceName ? `📍 ${raceName}` : '',
    `📅 ${fmtDate(startDate)} → ${fmtDate(endDate)}`,
    `📏 ${totalKm.toFixed(0)} km · ${completedWorkouts}/${totalWorkouts} entrenamientos`,
    `✅ Adherencia ${adherencePct}%`,
    '',
    'Entrenando con Zypace 🚀 zypace.com',
  ].filter(Boolean).join('\n');

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: 'https://zypace.com' });
        return;
      } catch { /* user cancelled */ }
    }
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(shareText);
    alert('Texto copiado al portapapeles');
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm space-y-4">

        {/* Card */}
        <div ref={cardRef}
          className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border border-zinc-700 shadow-2xl p-6">
          {/* Decorative gradient blob */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-lime-400/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

          <div className="relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Mesociclo completado</p>
                <p className="text-2xl font-extrabold text-zinc-100 mt-0.5">
                  {mesocycleNumber}{totalMesocycles ? <span className="text-zinc-500 text-lg font-normal"> / {totalMesocycles}</span> : ''}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-lime-400/10 border border-lime-400/30 flex items-center justify-center">
                <span className="text-xl">🏃</span>
              </div>
            </div>

            {/* Race */}
            {raceName && (
              <p className="text-sm font-semibold text-zinc-300 mb-4 line-clamp-1">📍 {raceName}</p>
            )}

            {/* Dates */}
            <div className="text-xs text-zinc-400 mb-5">
              {fmtDate(startDate)} → {fmtDate(endDate)}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 text-center">
                <p className="text-xl font-bold text-zinc-100">{totalKm.toFixed(0)}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">km totales</p>
              </div>
              <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 text-center">
                <p className="text-xl font-bold text-zinc-100">{completedWorkouts}<span className="text-zinc-500 text-sm">/{totalWorkouts}</span></p>
                <p className="text-[10px] text-zinc-500 mt-0.5">sesiones</p>
              </div>
              <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 text-center">
                <p className={`text-xl font-bold ${adherenceColor}`}>{adherencePct}%</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">adherencia</p>
              </div>
            </div>

            {runnerName && (
              <p className="text-xs text-zinc-500 mb-1">{runnerName}</p>
            )}

            {/* Brand */}
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-4 h-4 rounded bg-lime-400 flex items-center justify-center">
                <span className="text-[8px] font-black text-black">Z</span>
              </div>
              <span className="text-[11px] text-zinc-500 font-medium">zypace.com</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handleShare}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black transition-colors">
            {'share' in navigator ? 'Compartir' : 'Copiar texto'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
