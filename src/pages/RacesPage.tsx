import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import RaceCalendar from '../components/RaceCalendar';
import AddRaceForm from '../components/AddRaceForm';

export interface Race {
  id: string;
  name: string;
  date: string;
  distance?: string;
  goal_time?: string;
}

const RacesPage = () => {
  const { user } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRaces = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const q = query(collection(db, 'users', user.uid, 'races'), orderBy('date', 'asc'));
        const snap = await getDocs(q);
        setRaces(snap.docs.map(d => ({ id: d.id, ...d.data() } as Race)));
      } catch (error) {
        console.error('Error fetching races:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRaces();
  }, [user]);

  const addRace = (race: Race) => {
    setRaces(prev => [...prev, race].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  };

  return (
    <main className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-zinc-100">Calendario de Carreras</h1>
        <p className="text-lg text-zinc-400 mt-2">Planifica y visualiza tus próximas competiciones.</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-zinc-900 p-6 rounded-xl shadow-lg">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <p className="text-zinc-500">Cargando calendario...</p>
            </div>
          ) : (
            <RaceCalendar races={races} />
          )}
        </div>
        <div className="lg:col-span-1">
          <AddRaceForm onRaceAdded={addRace} />
        </div>
      </div>
    </main>
  );
};

export default RacesPage;
