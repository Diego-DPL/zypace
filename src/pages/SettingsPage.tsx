import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
// Strava assets (oficiales de la guía)
import connectWithStrava from '../assets/1.1 Connect with Strava Buttons/Connect with Strava Orange/btn_strava_connect_with_orange_x2.svg';
import compatibleWithStrava from '../assets/1.2-Strava-API-Logos/Compatible with Strava/cptblWith_strava_black/api_logo_cptblWith_strava_horiz_black.svg';

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

  // URL OAuth oficial (sin modificar el botón)
  const authUrl = useMemo(() => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = 'http://localhost:5173/strava-callback';
    const responseType = 'code';
    const approvalPrompt = 'force';
    const scope = 'read,activity:read,activity:read_all';
    return `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&approval_prompt=${approvalPrompt}&scope=${encodeURIComponent(scope)}`;
  }, []);

  const handleConnectToStrava = () => {
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
  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={compatibleWithStrava} alt="Compatible with Strava" className="h-6 w-auto" />
            <p className="text-sm sm:text-base font-medium text-gray-700">
              {isStravaConnected ? 'Conectado a Strava' : 'Conecta tu cuenta de Strava para sincronizar actividades.'}
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : isStravaConnected ? (
            <button onClick={handleDisconnectFromStrava} className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors">
              Desconectar
            </button>
          ) : (
            <>
              {/* Botón oficial: "Connect with Strava" (SVG, sin modificaciones) */}
              <button onClick={handleConnectToStrava} className="p-0 bg-transparent border-0" aria-label="Connect with Strava">
                <img src={connectWithStrava} alt="Connect with Strava" style={{ height: 48 }} />
              </button>
              {/* Opción alternativa como enlace directo requerido por la guía */}
              <a href={authUrl} target="_blank" rel="noopener noreferrer" className="sr-only">Connect with Strava</a>
            </>
          )}
  </div>
  <p className="text-xs text-gray-400 mt-4">Siguiendo las Strava API Brand Guidelines: se usa el botón oficial para OAuth y los logos aprobados.</p>
      </div>
    </main>
  );
};

export default SettingsPage;
