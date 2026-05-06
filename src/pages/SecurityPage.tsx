const SecurityPage = () => (
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Seguridad</h1>
    <p>En Zypace aplicamos prácticas modernas para proteger tus datos e información personal.</p>

    <h2>Infraestructura</h2>
    <p>Usamos <strong>Google Firebase / Firestore</strong> como base de datos y sistema de autenticación. Firestore aplica reglas de seguridad a nivel de documento que garantizan que cada usuario solo puede acceder a sus propios datos.</p>

    <h2>Autenticación</h2>
    <p>La autenticación se gestiona mediante Firebase Authentication, que emite tokens JWT seguros con expiración. Las contraseñas nunca se almacenan en texto plano.</p>

    <h2>Transmisión cifrada</h2>
    <p>Toda la comunicación entre tu dispositivo y nuestros servidores se cifra mediante <strong>HTTPS/TLS</strong>.</p>

    <h2>Tokens de Strava</h2>
    <p>Los tokens de acceso a Strava se almacenan cifrados en Firestore y solo son accesibles por las funciones del servidor. Nunca se exponen al cliente directamente.</p>

    <h2>Funciones de servidor</h2>
    <p>La generación de planes y el análisis de datos se ejecutan en <strong>Google Cloud Functions</strong> (Europa), con acceso restringido mediante autenticación de Firebase.</p>

    <h2>Reporte de vulnerabilidades</h2>
    <p>Si encuentras un problema de seguridad, envía los detalles a <strong>support.zypace@gmail.com</strong>. Agradecemos la divulgación responsable y respondemos en un plazo de 72 horas.</p>

    <h2>Copias de seguridad</h2>
    <p>Google Firebase realiza copias de seguridad automáticas de la base de datos de forma regular.</p>

    <h2>Actualizaciones</h2>
    <p>Esta página se actualizará conforme evolucionen nuestras prácticas y tecnologías.</p>

    <p className="text-xs text-gray-500">Última actualización: 04/05/2026</p>
  </main>
);
export default SecurityPage;
