import SEOHead from '../components/SEOHead';

const CookiesPage = () => (
  <>
  <SEOHead
    title="Política de Cookies"
    description="Información sobre las cookies que utiliza Zypace: tipos, finalidad y cómo gestionarlas o rechazarlas."
    canonical="/cookies"
  />
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Política de Cookies</h1>
    <p>Esta política explica qué son las cookies, qué tipos usamos en Zypace y cómo puedes gestionarlas, de conformidad con el RGPD y la Ley 34/2002 (LSSI-CE).</p>

    <h2>¿Qué son las cookies?</h2>
    <p>Las cookies son pequeños archivos de texto que el navegador almacena en tu dispositivo cuando visitas un sitio web. Sirven para recordar tu sesión, preferencias o medir el uso de la aplicación.</p>

    <h2>Cookies que utilizamos</h2>

    <h3>Cookies esenciales (no requieren consentimiento)</h3>
    <p>Necesarias para el funcionamiento básico del servicio. Sin ellas no es posible iniciar sesión ni usar la aplicación.</p>
    <table>
      <thead>
        <tr><th>Cookie</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>firebase:authUser:*</code></td>
          <td>Google Firebase</td>
          <td>Mantener la sesión del usuario autenticado</td>
          <td>Hasta cierre de sesión</td>
        </tr>
        <tr>
          <td><code>__session</code></td>
          <td>Google Firebase</td>
          <td>Gestión de sesión segura</td>
          <td>Sesión</td>
        </tr>
      </tbody>
    </table>

    <h3>Cookies analíticas (requieren consentimiento)</h3>
    <p>Usamos Google Analytics 4 para medir el tráfico y el comportamiento de los usuarios de forma agregada. Estas cookies solo se activan si aceptas el uso de cookies analíticas en el banner de consentimiento.</p>
    <table>
      <thead>
        <tr><th>Cookie</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>_ga</code></td>
          <td>Google Analytics</td>
          <td>Distinguir usuarios únicos (ID anónimo)</td>
          <td>2 años</td>
        </tr>
        <tr>
          <td><code>_ga_1FKJ0GVTBG</code></td>
          <td>Google Analytics</td>
          <td>Mantener el estado de la sesión de Analytics</td>
          <td>2 años</td>
        </tr>
      </tbody>
    </table>
    <p>Los datos recogidos por Google Analytics son anónimos y no permiten identificar a usuarios individuales. Google actúa como encargado de tratamiento. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Google</a>.</p>

    <h2>Cómo gestionar las cookies</h2>
    <p>Puedes revisar, eliminar o bloquear las cookies desde la configuración de tu navegador:</p>
    <ul>
      <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
      <li><a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
      <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
      <li><a href="https://support.microsoft.com/es-es/windows/eliminar-y-administrar-cookies-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
    </ul>
    <p>Ten en cuenta que bloquear las cookies esenciales impedirá el inicio de sesión y el funcionamiento correcto de la aplicación.</p>
    <p>También puedes optar por no ser rastreado por Google Analytics instalando el <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">complemento de inhabilitación de Google Analytics</a>.</p>

    <h2>Cambios en esta política</h2>
    <p>Actualizaremos esta página si añadimos nuevas categorías de cookies o herramientas de análisis, notificándote con al menos 15 días de antelación si los cambios son significativos.</p>

    <p className="text-xs text-gray-500">Última actualización: 10/05/2026</p>
  </main>
  </>
);
export default CookiesPage;
