const PrivacyPage = () => (
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Política de Privacidad</h1>
    <p>En Zypace nos comprometemos a proteger tu privacidad. Esta política describe qué datos recopilamos, cómo los usamos y cuáles son tus derechos.</p>

    <h2>Responsable del tratamiento</h2>
    <p>Zypace · Contacto: privacy@zypace.com</p>

    <h2>Datos que recopilamos</h2>
    <ul>
      <li><strong>Datos de cuenta:</strong> dirección de email y contraseña (cifrada).</li>
      <li><strong>Perfil del atleta:</strong> nombre, objetivos de carrera, disponibilidad semanal, historial de lesiones y nivel de experiencia (introducidos voluntariamente).</li>
      <li><strong>Datos de Strava:</strong> cuando conectas tu cuenta de Strava, importamos tus actividades de running (distancia, ritmo, frecuencia cardíaca, altimetría, fecha) y datos básicos de perfil público. Los permisos solicitados son <code>read</code>, <code>activity:read</code> y <code>activity:read_all</code>.</li>
      <li><strong>Registros de uso:</strong> datos técnicos anónimos necesarios para el funcionamiento del servicio (errores, logs del servidor).</li>
    </ul>

    <h2>Finalidad y base legal</h2>
    <ul>
      <li><strong>Generar planes de entrenamiento personalizados</strong> con inteligencia artificial (base legal: ejecución del contrato / interés legítimo).</li>
      <li><strong>Analizar tu progreso</strong> y mostrarte estadísticas de rendimiento (base legal: ejecución del contrato).</li>
      <li><strong>Mejorar el producto</strong> con datos agregados y anónimos (base legal: interés legítimo).</li>
    </ul>

    <h2>Uso de datos de Strava</h2>
    <p>Los datos obtenidos de Strava se usan exclusivamente para generar y adaptar tu plan de entrenamiento. <strong>No vendemos, compartimos ni cedemos tus datos de Strava a terceros.</strong> Puedes desconectar tu cuenta de Strava en cualquier momento desde Ajustes, lo que revocará nuestro acceso a futuros datos.</p>

    <h2>Proveedores de infraestructura</h2>
    <ul>
      <li><strong>Google Firebase / Firestore:</strong> autenticación y base de datos. Los datos se almacenan en servidores de Google Cloud (Europa).</li>
      <li><strong>OpenAI:</strong> generación de planes de entrenamiento. Solo se envían datos de rendimiento deportivo, nunca información de identificación personal.</li>
      <li><strong>Strava:</strong> importación de actividades, únicamente tras tu autorización explícita.</li>
    </ul>

    <h2>Conservación de datos</h2>
    <p>Conservamos tus datos mientras mantengas una cuenta activa. Puedes solicitar la eliminación completa escribiendo a privacy@zypace.com; eliminaremos tus datos en un plazo de 30 días.</p>

    <h2>Tus derechos (RGPD)</h2>
    <p>Como usuario tienes derecho a acceder, rectificar, portar, limitar el tratamiento y eliminar tus datos. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es). Para ejercer cualquier derecho contacta a privacy@zypace.com.</p>

    <h2>Cambios en esta política</h2>
    <p>Si realizamos cambios significativos te notificaremos por email o mediante un aviso visible en la aplicación.</p>

    <p className="text-xs text-gray-500">Última actualización: 04/05/2026</p>
  </main>
);
export default PrivacyPage;
