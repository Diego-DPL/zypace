import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { Race } from '../pages/RacesPage';

interface AddRaceFormProps {
  onRaceAdded: (race: Race) => void;
}

const AddRaceForm = ({ onRaceAdded }: AddRaceFormProps) => {
  const { user }             = useAuth();
  const [name, setName]      = useState('');
  const [date, setDate]      = useState('');
  const [distance, setDistance] = useState('');
  const [goalTime, setGoalTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, 'users', user.uid, 'races'), {
        name,
        date,
        distance: distance || null,
        goal_time: goalTime || null,
        created_at: serverTimestamp(),
      });
      onRaceAdded({ id: ref.id, name, date, distance: distance || undefined, goal_time: goalTime || undefined });
      setName(''); setDate(''); setDistance(''); setGoalTime('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const labelClass = "block text-xs font-medium text-zinc-400 mb-1";

  return (
    <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">🏁</span>
        <h2 className="text-xl font-bold text-zinc-100">Añadir carrera</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Nombre de la carrera</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej: Maratón de Madrid" className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Distancia</label>
          <input type="text" value={distance} onChange={e => setDistance(e.target.value)}
            placeholder="10k, Media maratón, Maratón…" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Tiempo objetivo <span className="text-zinc-600 font-normal">(hh:mm:ss)</span></label>
          <input type="text" value={goalTime} onChange={e => setGoalTime(e.target.value)}
            placeholder="1:45:00" className={inputClass} />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full py-2.5 px-4 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors shadow-lg shadow-lime-400/10">
          {loading ? 'Añadiendo…' : 'Añadir carrera'}
        </button>
      </form>
    </div>
  );
};

export default AddRaceForm;
