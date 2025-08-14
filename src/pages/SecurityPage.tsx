const SecurityPage = () => (
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Seguridad</h1>
    <p>Nos tomamos la seguridad en serio y aplicamos prácticas modernas para proteger tus datos.</p>
    <h2>Infraestructura</h2>
    <p>Usamos Supabase (PostgreSQL gestionado) con políticas RLS (Row Level Security) para aislar los datos de cada usuario.</p>
    <h2>Autenticación</h2>
    <p>La autenticación se basa en tokens seguros proporcionados por Supabase.</p>
    <h2>Transmisión cifrada</h2>
    <p>Toda la comunicación se cifra mediante HTTPS.</p>
    <h2>Reporte de vulnerabilidades</h2>
    <p>Si encuentras un problema de seguridad, envía detalles a security@zypace.com. Agradecemos la divulgación responsable.</p>
    <h2>Backups y retención</h2>
    <p>La base de datos se respalda regularmente. Podemos retener algunos registros para análisis internos limitados.</p>
    <h2>Actualizaciones</h2>
    <p>Esta página se actualizará conforme evolucionen nuestras prácticas.</p>
    <p className="text-xs text-gray-500">Última actualización: 14/08/2025</p>
  </main>
);
export default SecurityPage;
