import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import RaceCalendar from '../components/RaceCalendar';
import AddRaceForm from '../components/AddRaceForm';

export interface Race {
  id: number;
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
        const { data, error } = await supabase
          .from('races')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: true });
        if (error) throw error;
        setRaces(data || []);
      } catch (error) {
        console.error('Error fetching races:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRaces();
  }, [user]);

  const addRace = (race: Race) => {
    setRaces([...races, race].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  };

  return (
    <main className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800">Calendario de Carreras</h1>
        <p className="text-lg text-gray-600 mt-2">Planifica y visualiza tus próximas competiciones.</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-500">Cargando calendario...</p>
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
