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

const AddGoalModal = ({ open, onClose, onGoalAdded }: AddGoalModalProps) => {
  const { user }             = useAuth();
  const [name, setName]      = useState('');
  const [date, setDate]      = useState('');
  const [distance, setDistance] = useState('');
  const [goalTime, setGoalTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState<string | null>(null);

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
        distance:  distance  || null,
        goal_time: goalTime  || null,
        created_at: serverTimestamp(),
      });
      onGoalAdded({ id: ref.id, name, date, distance: distance || undefined, goal_time: goalTime || undefined });
      setName(''); setDate(''); setDistance(''); setGoalTime('');
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const labelClass = "block text-xs font-medium text-zinc-400 mb-1";

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6 relative"
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
              placeholder="10k, Media maratón, Maratón…" className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Tiempo objetivo <span className="text-zinc-600 font-normal">(hh:mm:ss, opcional)</span></label>
            <input
              type="text" value={goalTime} onChange={e => setGoalTime(e.target.value)}
              placeholder="1:45:00" className={inputClass}
            />
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
