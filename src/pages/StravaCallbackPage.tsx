import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const StravaCallbackPage = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [status, setStatus] = useState('Procesando autenticación...');

  useEffect(() => {
    const exchangeCodeForToken = async (code: string) => {
      if (!user) {
        setStatus('Error: Usuario no autenticado. Cierra esta ventana e inténtalo de nuevo.');
        return;
      }

      try {
        const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: import.meta.env.VITE_STRAVA_CLIENT_ID,
            client_secret: import.meta.env.VITE_STRAVA_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
          }),
        });

        const data = await response.json();

        if (data.errors) {
          throw new Error(data.message);
        }

  const { access_token, refresh_token, expires_at, athlete, scope } = data;

        let upsertError = null;
        {
          const { error: dbError } = await supabase.from('strava_tokens').upsert({
            user_id: user.id,
            access_token,
            refresh_token,
            expires_at,
            athlete_id: athlete?.id,
            athlete: athlete ?? null,
            scope: Array.isArray(scope) ? scope.join(',') : (scope || null)
          }, { onConflict: 'user_id' });
          upsertError = dbError;
        }
        if (upsertError) {
          const msg = (upsertError as any).message || '';
          const needsFallback = /column .* (athlete|scope)/i.test(msg) || /schema cache/i.test(msg);
          if (needsFallback) {
            // Reintentar sin columnas nuevas (migración aún no aplicada)
            const { error: legacyErr } = await supabase.from('strava_tokens').upsert({
              user_id: user.id,
              access_token,
              refresh_token,
              expires_at
            }, { onConflict: 'user_id' });
            if (legacyErr) throw legacyErr;
          } else {
            throw upsertError;
          }
        }

        setStatus('¡Conexión exitosa! Esta ventana se cerrará en breve.');
        setTimeout(() => window.close(), 2000);

      } catch (error: any) {
        setStatus(`Error en la conexión: ${error.message}. Puedes cerrar esta ventana.`);
      }
    };

    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      setStatus('Acceso denegado. Puedes cerrar esta ventana.');
      setTimeout(() => window.close(), 3000);
    } else if (code) {
      exchangeCodeForToken(code);
    } else {
      setStatus('No se recibió el código de autorización. Cierra esta ventana.');
    }
  }, [location, user]);

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">Conectando con Strava</h1>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
};

export default StravaCallbackPage;
