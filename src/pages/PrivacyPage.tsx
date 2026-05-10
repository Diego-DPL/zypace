import SEOHead from '../components/SEOHead';

const PrivacyPage = () => (
  <>
  <SEOHead
    title="Política de Privacidad"
    description="Consulta cómo Zypace recopila, usa y protege tus datos personales. Cumplimiento RGPD y derechos del usuario."
    canonical="/privacy"
    noindex={false}
  />
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Política de Privacidad</h1>
    <p>En Zypace nos comprometemos a proteger tu privacidad. Esta política describe qué datos recopilamos, cómo los usamos y cuáles son tus derechos, de conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).</p>

    <h2>1. Responsable del tratamiento</h2>
    <p>
      <strong>Titular:</strong> Diego Miguel Pérez Lorente<br />
      <strong>NIF:</strong> 48658090A<br />
      <strong>Dirección:</strong> Calle Castillo de Aledo, nº 140, Murcia, 30506, España<br />
      <strong>Contacto:</strong> <a href="mailto:support.zypace@gmail.com">support.zypace@gmail.com</a>
    </p>

    <h2>2. Datos que recopilamos</h2>
    <ul>
      <li><strong>Datos de cuenta:</strong> dirección de email y contraseña (almacenada cifrada).</li>
      <li><strong>Perfil del atleta:</strong> nombre, apellidos, fecha de nacimiento, género, país, objetivo de carrera, marca en 10K, disponibilidad semanal y nivel de experiencia (introducidos voluntariamente).</li>
      <li><strong>Datos de Strava:</strong> cuando conectas tu cuenta de Strava importamos tus actividades de running (distancia, ritmo, frecuencia cardíaca, altimetría, fecha) y datos básicos de perfil. Los permisos solicitados son <code>read</code>, <code>activity:read</code> y <code>activity:read_all</code>.</li>
      <li><strong>Datos de pago:</strong> Zypace no almacena datos de tarjeta. El pago se procesa íntegramente a través de Stripe; solo guardamos el identificador de cliente y suscripción de Stripe.</li>
      <li><strong>Datos de uso y analítica:</strong> páginas visitadas, eventos de conversión (registro, inicio de suscripción) y datos técnicos del navegador, recogidos de forma anónima a través de Google Analytics 4.</li>
      <li><strong>Registros técnicos:</strong> logs del servidor necesarios para el funcionamiento y la seguridad del servicio.</li>
    </ul>

    <h2>3. Finalidad y base legal</h2>
    <ul>
      <li><strong>Prestación del servicio:</strong> generar planes de entrenamiento personalizados, mostrar estadísticas de progreso y gestionar tu suscripción. Base legal: ejecución del contrato (art. 6.1.b RGPD).</li>
      <li><strong>Comunicaciones transaccionales:</strong> emails de bienvenida, recordatorios de carrera y notificaciones de cuenta. Base legal: ejecución del contrato.</li>
      <li><strong>Analítica de uso:</strong> medir el rendimiento de la plataforma y las conversiones, con datos agregados y anónimos. Base legal: consentimiento (art. 6.1.a RGPD), otorgado a través del banner de cookies.</li>
      <li><strong>Mejora del producto:</strong> análisis interno con datos agregados. Base legal: interés legítimo (art. 6.1.f RGPD).</li>
      <li><strong>Cumplimiento legal:</strong> conservación de registros de facturación. Base legal: obligación legal (art. 6.1.c RGPD).</li>
    </ul>

    <h2>4. Encargados de tratamiento (terceros)</h2>
    <p>Para prestar el servicio utilizamos los siguientes proveedores, todos ellos con acuerdos de encargado de tratamiento conformes al RGPD:</p>
    <ul>
      <li><strong>Google Firebase / Firestore (Google LLC):</strong> autenticación, base de datos y funciones en la nube. Datos almacenados en servidores de Google Cloud en Europa (región europe-west1). <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Google</a>.</li>
      <li><strong>Stripe (Stripe Payments Europe, Ltd.):</strong> procesamiento de pagos y gestión de suscripciones. Stripe está certificado PCI DSS nivel 1. <a href="https://stripe.com/es/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Stripe</a>.</li>
      <li><strong>OpenAI (OpenAI, LLC):</strong> generación de planes de entrenamiento mediante IA. Solo se transmiten datos de rendimiento deportivo; nunca se envían nombre, email u otros datos identificativos. <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">Política de privacidad de OpenAI</a>.</li>
      <li><strong>Strava (Strava, Inc.):</strong> importación de actividades deportivas, únicamente tras tu autorización expresa mediante OAuth. <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Strava</a>.</li>
      <li><strong>Resend (Resend, Inc.):</strong> envío de emails transaccionales (bienvenida, recordatorios). Solo se transmite tu dirección de email cuando es necesario enviar una comunicación. <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Política de privacidad de Resend</a>.</li>
      <li><strong>Google Analytics 4 (Google LLC):</strong> analítica de uso con datos anónimos. Solo activo con tu consentimiento previo mediante el banner de cookies. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Google</a>.</li>
    </ul>

    <h2>5. Uso de datos de Strava</h2>
    <p>Los datos obtenidos de Strava se usan exclusivamente para generar y adaptar tu plan de entrenamiento. <strong>No vendemos, compartimos ni cedemos tus datos de Strava a terceros.</strong> Puedes desconectar tu cuenta de Strava en cualquier momento desde Ajustes, lo que revocará nuestro acceso a futuros datos.</p>

    <h2>6. Conservación de datos</h2>
    <p>Conservamos tus datos mientras mantengas una cuenta activa. Tras la cancelación, los datos se eliminan en un plazo máximo de 30 días, salvo los registros de facturación que la ley obliga a conservar durante 5 años (art. 30 Código de Comercio). Puedes solicitar la eliminación anticipada escribiendo a <a href="mailto:support.zypace@gmail.com">support.zypace@gmail.com</a>.</p>

    <h2>7. Transferencias internacionales</h2>
    <p>Algunos proveedores (OpenAI, Resend) están ubicados en EE. UU. Las transferencias se amparan en las Cláusulas Contractuales Tipo aprobadas por la Comisión Europea o en las decisiones de adecuación correspondientes.</p>

    <h2>8. Tus derechos (RGPD)</h2>
    <p>Como usuario tienes derecho a:</p>
    <ul>
      <li><strong>Acceso:</strong> saber qué datos tenemos sobre ti.</li>
      <li><strong>Rectificación:</strong> corregir datos inexactos.</li>
      <li><strong>Supresión:</strong> eliminar tus datos («derecho al olvido»).</li>
      <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado.</li>
      <li><strong>Limitación:</strong> suspender el tratamiento en determinados casos.</li>
      <li><strong>Oposición:</strong> oponerte al tratamiento basado en interés legítimo.</li>
      <li><strong>Retirar el consentimiento</strong> en cualquier momento, sin que ello afecte a la licitud del tratamiento anterior.</li>
    </ul>
    <p>Para ejercer cualquier derecho, escribe a <a href="mailto:support.zypace@gmail.com">support.zypace@gmail.com</a>. Si no obtienes respuesta satisfactoria en el plazo de un mes, puedes presentar una reclamación ante la <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">Agencia Española de Protección de Datos (aepd.es)</a>.</p>

    <h2>9. Cambios en esta política</h2>
    <p>Si realizamos cambios significativos te notificaremos por email o mediante un aviso visible en la aplicación con al menos 15 días de antelación.</p>

    <p className="text-xs text-gray-500">Última actualización: 10/05/2026</p>
  </main>
  </>
);
export default PrivacyPage;
