import { useState, useRef, useEffect } from 'react';

// ── Diccionario ───────────────────────────────────────────────────────────────
export const GLOSSARY: Record<string, string> = {
  'RPE':          'Percepción del Esfuerzo (escala 1-10). 1 = paseo muy fácil; 6-7 = conversación difícil; 10 = sprint máximo. Te ayuda a regular la intensidad sin necesitar pulsómetro.',
  'VO2max':       'Capacidad máxima de tu cuerpo para usar oxígeno durante el ejercicio. Cuanto mayor sea, mejor será tu resistencia aeróbica. Mejora con series y entrenamientos intensos.',
  'umbral':       'Ritmo más rápido al que puedes correr durante ~1 hora sin acumular fatiga rápidamente. Es el límite entre esfuerzo moderado e intenso. Los entrenamientos de umbral son muy efectivos para mejorar.',
  'tempo':        'Carrera continua a ritmo moderado-alto durante 20-60 minutos. Más exigente que rodar tranquilo, pero sostenible. Mejora el umbral y la economía de carrera.',
  'fartlek':      'Entrenamiento con cambios de ritmo libres. Alternas tramos rápidos y lentos según tus sensaciones, sin estructura fija. Es más informal que las series.',
  'series':       'Repeticiones cortas a ritmo alto con recuperación entre ellas. Por ejemplo: 6 × 1 km. Mejoran la velocidad, el VO2max y la capacidad de aguantar ritmos rápidos.',
  'rodaje':       'Carrera continua a ritmo suave o moderado. Es la base del entrenamiento aeróbico y donde se acumula la mayor parte del volumen semanal.',
  'cadencia':     'Número de pasos por minuto al correr. Entre 170-180 ppm es eficiente para la mayoría de corredores. Una cadencia alta reduce el impacto y el riesgo de lesiones.',
  'zancada':      'Longitud de cada paso al correr. Una zancada muy larga puede aumentar el impacto en articulaciones. Combinarla con buena cadencia da eficiencia.',
  'progresivo':   'Entrenamiento que empieza a ritmo suave y va aumentando la velocidad gradualmente. Terminas más rápido de lo que empiezas.',
  'mesociclo':    'Bloque de entrenamiento de 4-6 semanas con un objetivo específico (base, desarrollo, específico o tapering). Tu plan se divide en mesociclos.',
  'tapering':     'Reducción del volumen de entrenamiento en las últimas 1-2 semanas antes de la carrera. Permite al cuerpo recuperarse y llegar al máximo nivel el día de la competición.',
  'Z1':           'Zona 1: ritmo muy suave, puedes mantener una conversación fluida. Ideal para recuperación activa.',
  'Z2':           'Zona 2: ritmo suave-moderado, puedes hablar en frases cortas. Construye la base aeróbica.',
  'Z3':           'Zona 3: ritmo moderado, conversación difícil. Equivale al ritmo de tempo.',
  'Z4':           'Zona 4: ritmo duro, solo puedes decir palabras sueltas. Cerca del umbral anaeróbico.',
  'Z5':           'Zona 5: esfuerzo máximo, insostenible más de pocos minutos. Trabaja el VO2max.',
};

// ── Componente individual ─────────────────────────────────────────────────────
export function GlossaryTerm({ term, children }: { term: string; children: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const key = Object.keys(GLOSSARY).find(k => k.toLowerCase() === term.toLowerCase());
  const definition = key ? GLOSSARY[key] : null;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!definition) return <>{children}</>;

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-lime-400 underline decoration-dotted underline-offset-2 cursor-help focus:outline-none hover:text-lime-300 transition-colors"
        title={`${key}: ${definition}`}
      >
        {children}
      </button>
      {open && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-zinc-800 border border-zinc-700 rounded-2xl p-4 shadow-2xl z-50 text-left"
          role="tooltip"
        >
          <span className="block text-xs font-bold text-lime-400 mb-1.5">{key}</span>
          <span className="block text-xs text-zinc-300 leading-relaxed">{definition}</span>
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-zinc-800 border-r border-b border-zinc-700 rotate-45" />
        </span>
      )}
    </span>
  );
}

// ── TextWithGlossary — parsea texto libre y envuelve términos conocidos ───────
export function TextWithGlossary({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const keys = Object.keys(GLOSSARY);
  const pattern = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = children.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const matched = keys.find(k => k.toLowerCase() === part.toLowerCase());
        if (matched) {
          return (
            <GlossaryTerm key={i} term={matched}>
              {part}
            </GlossaryTerm>
          );
        }
        return part;
      })}
    </span>
  );
}
