import SEOHead from '../components/SEOHead';

const TermsPage = () => (
  <>
  <SEOHead
    title="Términos y Condiciones"
    description="Condiciones de uso de Zypace, la plataforma de entrenamiento para runners con IA. Lee los términos antes de registrarte."
    canonical="/terms"
  />
  <main className="max-w-3xl mx-auto px-4 py-12 prose prose-sm sm:prose lg:prose-lg bg-white text-black dark:text-black">
    <h1>Términos y Condiciones</h1>
    <p>Estos términos regulan el uso de la plataforma Zypace. Al registrarte o usar el servicio, aceptas estas condiciones en su totalidad.</p>

    <h2>1. Datos del titular (Aviso Legal — LSSI)</h2>
    <p>
      <strong>Titular:</strong> Diego Miguel Pérez Lorente<br />
      <strong>NIF:</strong> 48658090A<br />
      <strong>Domicilio:</strong> Calle Castillo de Aledo, nº 140, Murcia, 30506, España<br />
      <strong>Email de contacto:</strong> <a href="mailto:support.zypace@gmail.com">support.zypace@gmail.com</a><br />
      <strong>Sitio web:</strong> https://www.zypace.com
    </p>

    <h2>2. Descripción del servicio</h2>
    <p>Zypace es una plataforma de entrenamiento personal para corredores que combina análisis de actividad con inteligencia artificial para generar planes de entrenamiento personalizados, gestionar un calendario de carreras y hacer seguimiento del progreso.</p>

    <h2>3. Suscripción y precios</h2>
    <ul>
      <li><strong>Periodo de prueba:</strong> 30 días gratuitos desde el registro. No se realiza ningún cargo hasta el día 31.</li>
      <li><strong>Precio:</strong> 9,99 € / mes (IVA incluido) tras el periodo de prueba.</li>
      <li><strong>Renovación automática:</strong> la suscripción se renueva automáticamente cada mes. Puedes cancelarla en cualquier momento desde Ajustes → Suscripción.</li>
      <li><strong>Cancelación:</strong> si cancelas antes de que finalice el periodo actual, conservas el acceso hasta el último día pagado. No se realizan reembolsos parciales por los días no utilizados.</li>
      <li><strong>Pago:</strong> se procesa a través de Stripe. Aceptamos las principales tarjetas de crédito y débito.</li>
      <li><strong>Cambios de precio:</strong> cualquier cambio en el precio se comunicará con al menos 30 días de antelación por email.</li>
    </ul>

    <h2>4. Uso aceptable</h2>
    <p>Debes usar el servicio de forma legal y responsable. Queda prohibido:</p>
    <ul>
      <li>Intentar comprometer la seguridad de la plataforma o de otros usuarios.</li>
      <li>Usar el servicio de forma automatizada para extraer datos masivamente (scraping).</li>
      <li>Compartir credenciales de acceso o crear cuentas falsas.</li>
      <li>Violar los Términos de Uso de la API de Strava al usar esta plataforma.</li>
    </ul>

    <h2>5. No asesoramiento médico</h2>
    <p>Los planes e información generados por Zypace son orientativos y <strong>no constituyen asesoramiento médico ni de salud</strong>. Consulta a un profesional sanitario antes de realizar cambios exigentes en tu entrenamiento, especialmente si tienes lesiones o condiciones de salud preexistentes. El uso del servicio es bajo tu propia responsabilidad.</p>

    <h2>6. Cuenta de usuario</h2>
    <p>Eres responsable de mantener la confidencialidad de tus credenciales y de todas las actividades realizadas bajo tu cuenta. En caso de uso no autorizado, notifícanos inmediatamente a support.zypace@gmail.com.</p>

    <h2>7. Integración con Strava</h2>
    <p>La conexión con Strava es opcional. Al vincular tu cuenta, autorizas a Zypace a acceder a tus actividades según los permisos que concedas. Puedes revocar este acceso en cualquier momento desde Ajustes o directamente desde tu cuenta de Strava en <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener noreferrer">strava.com/settings/apps</a>.</p>

    <h2>8. Propiedad intelectual</h2>
    <p>El software, diseño, marca y contenidos de Zypace son propiedad de Diego Miguel Pérez Lorente salvo indicación contraria. Los planes de entrenamiento generados para ti son de uso personal y no pueden distribuirse comercialmente.</p>

    <h2>9. Limitación de responsabilidad</h2>
    <p>Zypace no se responsabiliza de lesiones, daños físicos o perjuicios económicos derivados del seguimiento de los planes generados. En ningún caso la responsabilidad de Zypace superará el importe pagado por el usuario en los 3 meses anteriores al evento que origine la reclamación.</p>

    <h2>10. Disponibilidad del servicio</h2>
    <p>Nos esforzamos por mantener el servicio disponible de forma continua, pero no garantizamos disponibilidad ininterrumpida. Podemos modificar o interrumpir funcionalidades con aviso previo razonable, salvo en caso de mantenimiento urgente por motivos de seguridad.</p>

    <h2>11. Suspensión de cuentas</h2>
    <p>Podemos suspender o cancelar cuentas que vulneren estos términos. En casos graves (fraude, intentos de intrusión) la suspensión puede ser inmediata y sin previo aviso.</p>

    <h2>12. Modificaciones</h2>
    <p>Podemos actualizar estos términos. Te notificaremos de cambios significativos por email con al menos 15 días de antelación. Continuar usando la plataforma tras la entrada en vigor de los cambios implica su aceptación.</p>

    <h2>13. Ley aplicable y jurisdicción</h2>
    <p>Estos términos se rigen por la legislación española. Para cualquier disputa, las partes se someten a los juzgados y tribunales competentes según la normativa vigente, sin perjuicio de los derechos que asisten a los consumidores.</p>

    <h2>14. Contacto</h2>
    <p>Para cualquier consulta: <a href="mailto:support.zypace@gmail.com">support.zypace@gmail.com</a></p>

    <p className="text-xs text-gray-500">Versión: v2 · Última actualización: 10/05/2026</p>
  </main>
  </>
);
export default TermsPage;
