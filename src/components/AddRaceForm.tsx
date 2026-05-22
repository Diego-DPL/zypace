import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { Race } from '../types';

interface AddRaceFormProps {
  onRaceAdded: (race: Race) => void;
}

const TERRAIN_OPTIONS = [
  { value: 'road',  label: 'Asfalto' },
  { value: 'trail', label: 'Trail'   },
  { value: 'mixed', label: 'Mixto'   },
  { value: 'track', label: 'Pista'   },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'A', label: 'A', desc: 'Objetivo principal' },
  { value: 'B', label: 'B', desc: 'Secundario'         },
  { value: 'C', label: 'C', desc: 'Con dorsales'       },
] as const;

const DISTANCE_PRESETS = [
  { value: '5 km',     label: '5 km'      },
  { value: '10 km',    label: '10 km'     },
  { value: '21 km',    label: '21 km',  sub: 'Media'    },
  { value: '42 km',    label: '42 km',  sub: 'Maratón'  },
  { value: '50 km',    label: '50 km'     },
  { value: '80 km',    label: '80 km'     },
  { value: '100 km',   label: '100 km+'   },
  { value: '__custom', label: 'Otro'      },
] as const;

const AddRaceForm = ({ onRaceAdded }: AddRaceFormProps) => {
  const { user } = useAuth();

  const [name,            setName]            = useState('');
  const [date,            setDate]            = useState('');
  const [terrain,         setTerrain]         = useState<'road' | 'trail' | 'mixed' | 'track'>('road');
  const [distancePreset,  setDistancePreset]  = useState('');
  const [distanceCustom,  setDistanceCustom]  = useState('');
  const [elevationGainM,  setElevationGainM]  = useState('');
  const [goalH,           setGoalH]           = useState('');
  const [goalM,           setGoalM]           = useState('');
  const [goalS,           setGoalS]           = useState('');
  const [priority,        setPriority]        = useState<'A' | 'B' | 'C'>('A');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const isTrail = terrain === 'trail' || terrain === 'mixed';

  const distanceValue = distancePreset === '__custom'
    ? (distanceCustom.trim() ? distanceCustom.trim() + ' km' : null)
    : distancePreset || null;

  const goalTimeValue = (goalH || goalM || goalS)
    ? `${parseInt(goalH || '0', 10)}:${String(Math.min(parseInt(goalM || '0', 10), 59)).padStart(2, '0')}:${String(Math.min(parseInt(goalS || '0', 10), 59)).padStart(2, '0')}`
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    const elevNum = isTrail && elevationGainM ? parseInt(elevationGainM, 10) : null;
    try {
      const ref = await addDoc(collection(db, 'users', user.uid, 'races'), {
        name,
        date,
        distance:         distanceValue,
        elevation_gain_m: elevNum,
        goal_time:        goalTimeValue,
        terrain,
        priority,
        created_at: serverTimestamp(),
      });
      onRaceAdded({
        id: ref.id, name, date, terrain, priority,
        distance: distanceValue ?? undefined,
        elevation_gain_m: elevNum ?? undefined,
        goal_time: goalTimeValue ?? undefined,
      });
      setName(''); setDate(''); setTerrain('road');
      setDistancePreset(''); setDistanceCustom('');
      setElevationGainM('');
      setGoalH(''); setGoalM(''); setGoalS('');
      setPriority('A');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";
  const chipBase   = "px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors";
  const timeInput  = "w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 text-center text-lg font-mono focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";

  return (
    <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">🏁</span>
        <h2 className="text-xl font-bold text-zinc-100">Añadir carrera</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Name */}
        <div>
          <label className={labelClass}>Nombre de la carrera</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej: Maratón de Madrid"
            className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition"
            required />
        </div>

        {/* Date */}
        <div>
          <label className={labelClass}>Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition"
            required />
        </div>

        {/* Terrain — first so distance/elevation can be conditional */}
        <div>
          <label className={labelClass}>Tipo de terreno</label>
          <div className="grid grid-cols-4 gap-1.5">
            {TERRAIN_OPTIONS.map(t => (
              <button key={t.value} type="button"
                onClick={() => { setTerrain(t.value); if (t.value !== 'trail' && t.value !== 'mixed') setElevationGainM(''); }}
                className={`py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${terrain === t.value ? 'border-lime-400 bg-lime-400/10 text-zinc-100' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-lime-400/50'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Distance presets */}
        <div>
          <label className={labelClass}>Distancia</label>
          <div className="flex flex-wrap gap-1.5">
            {DISTANCE_PRESETS.map(p => (
              <button key={p.value} type="button" onClick={() => setDistancePreset(p.value)}
                className={`${chipBase} flex flex-col items-center ${distancePreset === p.value ? 'border-lime-400 bg-lime-400/10 text-zinc-100' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-lime-400/50'}`}>
                <span>{p.label}</span>
                {'sub' in p && <span className="text-[10px] text-zinc-500">{(p as any).sub}</span>}
              </button>
            ))}
          </div>
          {distancePreset === '__custom' && (
            <div className="flex items-center gap-2 mt-2">
              <input type="number" min="1" value={distanceCustom} onChange={e => setDistanceCustom(e.target.value)}
                placeholder="73"
                className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition" />
              <span className="text-sm font-semibold text-zinc-400 shrink-0">km</span>
            </div>
          )}
        </div>

        {/* Elevation — only for trail/mixed */}
        {isTrail && (
          <div>
            <label className={labelClass}>Desnivel positivo (D+)</label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={elevationGainM} onChange={e => setElevationGainM(e.target.value)}
                placeholder="2500"
                className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition" />
              <span className="text-sm font-semibold text-zinc-400 shrink-0">metros</span>
            </div>
          </div>
        )}

        {/* Goal time — H : MM : SS */}
        <div>
          <label className={labelClass}>Tiempo objetivo <span className="text-zinc-600 font-normal">(opcional)</span></label>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center">
              <input type="number" min="0" max="23" value={goalH}
                onChange={e => setGoalH(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="0" className={timeInput} />
              <p className="text-[10px] text-zinc-600 mt-1 font-medium uppercase tracking-wide">horas</p>
            </div>
            <span className="text-2xl text-zinc-600 font-bold pb-5">:</span>
            <div className="flex-1 text-center">
              <input type="number" min="0" max="59" value={goalM}
                onChange={e => setGoalM(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="00" className={timeInput} />
              <p className="text-[10px] text-zinc-600 mt-1 font-medium uppercase tracking-wide">min</p>
            </div>
            <span className="text-2xl text-zinc-600 font-bold pb-5">:</span>
            <div className="flex-1 text-center">
              <input type="number" min="0" max="59" value={goalS}
                onChange={e => setGoalS(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="00" className={timeInput} />
              <p className="text-[10px] text-zinc-600 mt-1 font-medium uppercase tracking-wide">seg</p>
            </div>
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

        <button type="submit" disabled={loading}
          className="w-full py-2.5 px-4 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors shadow-lg shadow-lime-400/10">
          {loading ? 'Añadiendo…' : 'Añadir carrera'}
        </button>
      </form>
    </div>
  );
};

export default AddRaceForm;
