import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';

const StravaCallbackPage = () => {
  const location    = useLocation();
  const { user }    = useAuth();
  const [status, setStatus] = useState('Procesando autenticación...');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code   = params.get('code');
    const denied = params.get('error');

    if (denied) {
      setStatus('Acceso denegado. Puedes cerrar esta ventana.');
      setTimeout(() => window.close(), 3000);
      return;
    }
    if (!code) {
      setStatus('No se recibió el código de autorización. Cierra esta ventana.');
      return;
    }
    if (!user) {
      setStatus('Error: usuario no autenticado. Cierra esta ventana e inténtalo de nuevo.');
      return;
    }

    // El intercambio de código → tokens se hace en el servidor (Cloud Function)
    // para que el client_secret nunca esté expuesto en el frontend.
    const exchangeToken = httpsCallable(functions, 'stravaExchangeToken');
    exchangeToken({ code })
      .then(() => {
        setStatus('¡Conexión exitosa! Esta ventana se cerrará en breve.');
        setTimeout(() => window.close(), 2000);
      })
      .catch((err: any) => {
        setStatus(`Error en la conexión: ${err.message}. Puedes cerrar esta ventana.`);
      });
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
