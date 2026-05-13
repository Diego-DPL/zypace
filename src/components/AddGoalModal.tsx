import { useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { Race } from '../types';

interface AddGoalModalProps {
  open: boolean;
  onClose: () => void;
  onGoalAdded: (race: Race) => void;
}

const TERRAIN_OPTIONS = [
  { value: 'road',  label: 'Asfalto' },
  { value: 'trail', label: 'Trail' },
  { value: 'mixed', label: 'Mixto' },
  { value: 'track', label: 'Pista' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'A', label: 'A', desc: 'Objetivo principal' },
  { value: 'B', label: 'B', desc: 'Secundario' },
  { value: 'C', label: 'C', desc: 'Con dorsales' },
] as const;

const AddGoalModal = ({ open, onClose, onGoalAdded }: AddGoalModalProps) => {
  const { user }               = useAuth();
  const [name, setName]        = useState('');
  const [date, setDate]        = useState('');
  const [distance, setDistance] = useState('');
  const [elevationGainM, setElevationGainM] = useState('');
  const [goalTime, setGoalTime] = useState('');
  const [terrain, setTerrain]  = useState<'road' | 'trail' | 'mixed' | 'track'>('road');
  const [priority, setPriority] = useState<'A' | 'B' | 'C'>('A');
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, 'users', user.uid, 'races'), {
        name,
        date,
        distance:          distance          || null,
        elevation_gain_m:  elevationGainM ? parseInt(elevationGainM, 10) : null,
        goal_time:         goalTime         || null,
        terrain,
        priority,
        created_at: serverTimestamp(),
      });
      onGoalAdded({ id: ref.id, name, date, distance: distance || undefined, elevation_gain_m: elevationGainM ? parseInt(elevationGainM, 10) : undefined, goal_time: goalTime || undefined, terrain, priority });
      setName(''); setDate(''); setDistance(''); setElevationGainM(''); setGoalTime(''); setTerrain('road'); setPriority('A');
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 text-lg leading-none"
        >✕</button>
        <h2 className="text-xl font-bold text-zinc-100 mb-5">Añadir objetivo</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Carrera o evento</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej: Maratón de Madrid" className={inputClass} required
            />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              className={inputClass} required
            />
          </div>
          <div>
            <label className={labelClass}>Distancia <span className="text-zinc-600 font-normal">(opcional)</span></label>
            <input
              type="text" value={distance} onChange={e => setDistance(e.target.value)}
              placeholder="10k, Media maratón, 50km…" className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Desnivel positivo D+ <span className="text-zinc-600 font-normal">(metros, opcional — trail)</span>
            </label>
            <input
              type="number" min="0" value={elevationGainM} onChange={e => setElevationGainM(e.target.value)}
              placeholder="Ej: 2500" className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Tiempo objetivo <span className="text-zinc-600 font-normal">(hh:mm:ss, opcional)</span></label>
            <input
              type="text" value={goalTime} onChange={e => setGoalTime(e.target.value)}
              placeholder="1:45:00" className={inputClass}
            />
          </div>

          {/* Terrain */}
          <div>
            <label className={labelClass}>Tipo de terreno</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TERRAIN_OPTIONS.map(t => (
                <button key={t.value} type="button" onClick={() => setTerrain(t.value)}
                  className={`py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${terrain === t.value ? 'border-lime-400 bg-lime-400/10 text-zinc-100' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-lime-400/50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className={labelClass}>Prioridad en tu temporada</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRIORITY_OPTIONS.map(p => (
                <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                  className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border-2 transition-colors ${priority === p.value ? (p.value === 'A' ? 'border-lime-400 bg-lime-400/10' : p.value === 'B' ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-500 bg-zinc-500/10') : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}>
                  <span className={`text-base font-bold ${priority === p.value ? (p.value === 'A' ? 'text-lime-400' : p.value === 'B' ? 'text-blue-400' : 'text-zinc-400') : 'text-zinc-400'}`}>{p.label}</span>
                  <span className="text-[10px] text-zinc-500">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold rounded-lg transition-colors"
            >Cancelar</button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2.5 px-4 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >{loading ? 'Guardando…' : 'Añadir objetivo'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default AddGoalModal;
