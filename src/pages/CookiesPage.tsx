const CookiesPage = () => (
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Política de Cookies</h1>
    <p>Esta política explica qué son las cookies, qué tipos usamos en Zypace y cómo puedes gestionarlas.</p>

    <h2>¿Qué son las cookies?</h2>
    <p>Las cookies son pequeños archivos de texto que el navegador almacena en tu dispositivo. Sirven para recordar tu sesión, preferencias o medir el uso de la aplicación.</p>

    <h2>Cookies que utilizamos</h2>
    <ul>
      <li>
        <strong>Cookies esenciales:</strong> necesarias para el funcionamiento básico del servicio. Incluyen la sesión de autenticación de Firebase (token de usuario). Sin ellas, no es posible iniciar sesión ni usar la aplicación. No requieren consentimiento previo.
      </li>
      <li>
        <strong>Cookies de preferencias:</strong> almacenan ajustes opcionales de interfaz como el tema o el idioma, si aplica. Solo se activan tras tu interacción con esas opciones.
      </li>
      <li>
        <strong>Cookies analíticas:</strong> actualmente no utilizamos herramientas de analítica de terceros. Si en el futuro se añaden, se hará con tu consentimiento explícito previo.
      </li>
    </ul>

    <h2>Cookies de terceros</h2>
    <p>No cargamos scripts de publicidad ni de redes sociales. Firebase puede establecer cookies propias para gestionar la autenticación; consulta la política de privacidad de Google para más información.</p>

    <h2>Cómo gestionar las cookies</h2>
    <p>Puedes revisar, eliminar o bloquear las cookies desde la configuración de tu navegador. Ten en cuenta que bloquear las cookies esenciales impedirá el inicio de sesión y el funcionamiento correcto de la aplicación.</p>

    <h2>Cambios en esta política</h2>
    <p>Actualizaremos esta página si añadimos nuevas categorías de cookies o herramientas de análisis.</p>

    <p className="text-xs text-gray-500">Última actualización: 04/05/2026</p>
  </main>
);
export default CookiesPage;
