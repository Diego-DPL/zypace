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

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Añadir Nueva Carrera</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Carrera</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Distancia (ej. 10k, Maratón)</label>
          <input type="text" value={distance} onChange={e => setDistance(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo Objetivo</label>
          <input type="text" value={goalTime} onChange={e => setGoalTime(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Añadiendo...' : 'Añadir Carrera'}
        </button>
        {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
      </form>
    </div>
  );
};

export default AddRaceForm;
