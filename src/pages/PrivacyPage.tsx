const PrivacyPage = () => (
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Política de Privacidad</h1>
    <p>En Zypace respetamos tu privacidad. Este documento describe qué datos recopilamos, cómo los usamos y tus derechos.</p>
    <h2>Datos que recopilamos</h2>
    <ul>
      <li>Información de cuenta (email).</li>
      <li>Datos de perfil opcionales (nombre, objetivos, disponibilidad).</li>
      <li>Actividades importadas de Strava cuando otorgas permiso.</li>
    </ul>
    <h2>Uso de los datos</h2>
    <p>Los datos se utilizan para generar planes personalizados, mostrar estadísticas y mejorar el producto.</p>
    <h2>Conservación y eliminación</h2>
    <p>Puedes solicitar la eliminación de tu cuenta y datos escribiendo a privacy@zypace.com.</p>
    <h2>Terceros</h2>
    <p>Utilizamos Supabase para autenticación y almacenamiento. Strava sólo se usa tras tu autorización explícita.</p>
    <h2>Tus derechos</h2>
    <p>Acceder, rectificar, portar y eliminar tus datos. Contacto: privacy@zypace.com.</p>
    <h2>Cambios</h2>
    <p>Actualizaremos esta política cuando sea necesario. Indicaremos la fecha de la última revisión.</p>
    <p className="text-xs text-gray-500">Última actualización: 14/08/2025</p>
  </main>
);
export default PrivacyPage;
