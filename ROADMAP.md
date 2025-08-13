# Zypace - Roadmap del Proyecto

Este documento describe la hoja de ruta para el desarrollo de la aplicación Zypace. Nos ayuda a llevar un registro de las funcionalidades implementadas, las que están en curso y las que se planean para el futuro.

## Fase 1: Fundación del Proyecto (Completada)

-   [x] **Configuración del Proyecto**: Inicialización con Vite, React y TypeScript.
-   [x] **Estilos**: Integración de Tailwind CSS 4.1.
-   [x] **Autenticación de Usuarios**:
    -   [x] Configuración de Supabase como backend.
    -   [x] Implementación de inicio de sesión y registro de usuarios.
    -   [x] Rutas protegidas y públicas.
-   [x] **Calendario de Carreras**:
    -   [x] Creación de la tabla `races` en Supabase con RLS.
    -   [x] Implementación de la vista de calendario (`react-big-calendar`).
    -   [x] Formulario para añadir nuevas carreras.
    -   [x] Mejoras visuales en la interfaz del calendario.

## Fase 2: Integración y Planes de Entrenamiento

-   [ ] **Integración con Strava**:
    -   [ ] Configurar el flujo de autenticación OAuth2 con Strava.
    -   [ ] Crear una tabla para almacenar los tokens de acceso de Strava de forma segura.
    -   [ ] Sincronizar y mostrar las actividades de Strava del usuario.
    -   [ ] Botón para conectar/desconectar la cuenta de Strava en el perfil del usuario.
-   [ ] **Generación de Planes de Entrenamiento (IA)**:
    -   [ ] Diseñar la interfaz para que el usuario defina sus objetivos (carrera, distancia, tiempo deseado).
    -   [ ] Realizar llamadas a una API de IA (como OpenAI) para generar un plan de entrenamiento estructurado.
    -   [ ] Crear tablas en Supabase (`training_plans`, `workouts`) para almacenar los planes generados.
-   [ ] **Visualización del Plan de Entrenamiento**:
    -   [ ] Mostrar los entrenamientos programados en el calendario junto a las carreras.
    -   [ ] Diferenciar visualmente carreras de entrenamientos.
    -   [ ] Permitir al usuario marcar entrenamientos como "completados" manualmente.

## Fase 3: Métricas y Progreso

-   [ ] **Sincronización de Entrenamientos Completados**:
    -   [ ] Comparar los entrenamientos de Strava con los entrenamientos planificados.
    -   [ ] Marcar automáticamente los entrenamientos como completados.
-   [ ] **Panel de Métricas (Dashboard)**:
    -   [ ] Crear una página de "Progreso" o un dashboard principal.
    -   [ ] Mostrar métricas clave (volumen semanal, ritmo promedio, etc.).
    -   [ ] Gráficas para visualizar la progresión a lo largo del tiempo.
-   [ ] **Reajuste Inteligente del Plan**:
    -   [ ] Desarrollar la lógica para analizar los entrenamientos completados vs. los planificados.
    -   [ ] Sugerir ajustes en la carga de entrenamiento (o reajustar automáticamente) si el usuario se salta entrenamientos o muestra signos de fatiga/mejora.

## Mejoras Futuras y Refinamiento

-   [ ] **Vista de Detalles de Carrera**: Al hacer clic en una carrera en el calendario, mostrar más detalles y permitir la edición.
-   [ ] **Perfil de Usuario**: Una página donde el usuario pueda gestionar su información y configuración.
-   [ ] **Notificaciones**: Recordatorios de próximos entrenamientos o carreras.
-   [ ] **Mejoras de UI/UX**: Refinar la interfaz, añadir animaciones y mejorar la experiencia general.
-   [ ] **Pruebas**: Añadir pruebas unitarias y de integración.
