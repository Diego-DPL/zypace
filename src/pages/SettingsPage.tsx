import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const SettingsPage = () => {
  const { user } = useAuth();
  const [isStravaConnected, setIsStravaConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const verifyStravaConnection = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: tokenData, error: tokenError } = await supabase
        .from('strava_tokens')
        .select('access_token')
        .eq('user_id', user.id)
        .single();

      if (tokenError || !tokenData) {
        setIsStravaConnected(false);
        return;
      }

      const response = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (response.ok) {
        setIsStravaConnected(true);
      } else {
        await supabase.from('strava_tokens').delete().eq('user_id', user.id);
        setIsStravaConnected(false);
      }
    } catch (error) {
      console.error('Error verifying Strava connection:', error);
      await supabase.from('strava_tokens').delete().eq('user_id', user.id);
      setIsStravaConnected(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    verifyStravaConnection();
  }, [verifyStravaConnection]);

  const handleConnectToStrava = () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = 'http://localhost:5173/strava-callback';
    const responseType = 'code';
  const approvalPrompt = 'force'; // forzar pantalla de consentimiento para asegurar scopes
  // Incluir ambos scopes explícitos (Strava documenta activity:read y activity:read_all)
  const scope = 'read,activity:read,activity:read_all';
    
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=${responseType}&approval_prompt=${approvalPrompt}&scope=${scope}`;
    
    const popup = window.open(authUrl, 'stravaAuth', 'width=600,height=700');
    const interval = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(interval);
        verifyStravaConnection();
      }
    }, 1000);
  };

  const handleDisconnectFromStrava = async () => {
    if (!user) return;
    try {
      const { data: tokenData } = await supabase
        .from('strava_tokens')
        .select('access_token')
        .eq('user_id', user.id)
        .single();

      if (tokenData) {
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
      }
    } catch (error) {
      console.error('Error deauthorizing from Strava:', error);
    } finally {
      await supabase.from('strava_tokens').delete().eq('user_id', user.id);
      setIsStravaConnected(false);
    }
  };

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Ajustes</h1>
  <div className="bg-white p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Integraciones</h2>
  <div className="flex justify-between items-center">
          <div className="flex items-center">
            <img src="https://1000logos.net/wp-content/uploads/2020/09/Strava-Logo.png" alt="Strava Logo" className="w-20 h-auto mr-4"/>
            <p className="text-lg font-medium text-gray-700">
              {isStravaConnected ? 'Conectado a Strava' : 'Conectar con Strava para sincronizar actividades.'}
            </p>
          </div>
          {loading ? (
            <p>Cargando...</p>
          ) : isStravaConnected ? (
            <button onClick={handleDisconnectFromStrava} className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors">
              Desconectar
            </button>
          ) : (
            <button onClick={handleConnectToStrava} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-600 transition-colors">
              Conectar con Strava
            </button>
          )}
  </div>
  <p className="text-xs text-gray-400 mt-4">Si no ves actividades al sincronizar, desconecta y vuelve a conectar (se fuerza re-consent) y luego usa el botón Dbg en el calendario.</p>
      </div>
    </main>
  );
};

export default SettingsPage;
