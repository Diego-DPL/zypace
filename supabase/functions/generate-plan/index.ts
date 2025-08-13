// Tipos runtime Supabase
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore Tipos Deno resueltos en runtime Supabase
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// Declaración mínima (si los tipos no se cargan en el editor)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RacePayload {
  id?: number | string;
  name: string;
  date: string;
  distance?: number | string;
}

interface PlanDay {
  date: string;
  description: string;
  explanation?: {
    type: string; // series, tempo, largo, descanso, suave, otro
    purpose: string; // objetivo fisiológico
    details: string; // cómo ejecutarlo
    intensity?: string | null; // opcional: zona o ritmo
  }
}

interface PlanResponse {
  plan: PlanDay[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Incoming request`);

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new Error('JSON inválido');
    }
    const { race, goal } = body as { race?: RacePayload; goal?: string };
    console.log(`[${requestId}] Payload`, { race, goal });

    if (!race || !goal) throw new Error('Faltan detalles de la carrera o el objetivo.');
    if (!race.date) throw new Error('La carrera no tiene fecha.');

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada');

  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5';

    const raceDate = new Date(race.date);
    if (isNaN(raceDate.getTime())) throw new Error('Fecha de carrera inválida');
  // Nuevo: el plan inicia hoy (fecha de generación)
  const today = new Date();
  // Normalizar a medianoche UTC para consistencia
  const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (startDate > raceDate) throw new Error('La fecha de la carrera ya pasó o es anterior a hoy');

    const startISO = startDate.toISOString().split('T')[0];
    const raceISO = raceDate.toISOString().split('T')[0];

  // Prompt principal se reparte en developerInstructions + userPrompt

  const developerInstructions = `Eres un entrenador experto de running. Devuelve SOLO JSON válido con estructura {"plan":[{"date":"YYYY-MM-DD","description":"...","explanation":{"type":"series|tempo|largo|descanso|suave|otro","purpose":"...","details":"...","intensity":"opcional"}}]}. Reglas: 4-5 sesiones por semana desde ${startISO} hasta ${raceISO}. Marca días de descanso con description="Descanso" y type="descanso". Progresión de carga. Descripciones concisas. explanation.purpose explica el objetivo fisiológico (ej: mejorar VO2max, umbral, base aeróbica, recuperación). details dice cómo ejecutarlo (estructura series, ritmos relativos: fácil, tempo, 5k, etc.). SIEMPRE incluye explanation incluso en descanso (purpose="recuperación" y details breve). Nada de texto fuera del JSON.`;
    const userPrompt = `Carrera: ${race.name}\nDistancia: ${race.distance || 'No especificada'} km\nFecha: ${raceISO}\nObjetivo: ${goal}`;

    async function callResponsesAPI(activeModel: string) {
      const payload = {
        model: activeModel,
        input: [
          { role: 'developer', content: developerInstructions },
          { role: 'user', content: userPrompt }
        ]
      } as Record<string, unknown>;

      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const raw = await res.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch { /* keep raw for error */ }
      if (!res.ok) {
        console.error(`[${requestId}] OpenAI error (${activeModel}) ${res.status}: ${raw.slice(0,400)}`);
        throw new Error(data?.error?.message || `OpenAI fallo (${res.status})`);
      }
      const outputs: string[] = [];
      if (Array.isArray(data?.output)) {
        for (const item of data.output) {
          if (item?.content && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c.type === 'output_text' && typeof c.text === 'string') outputs.push(c.text);
            }
          }
        }
      }
      const combined = outputs.join('\n').trim();
      if (!combined) throw new Error('Respuesta OpenAI vacía');
      return combined;
    }

    function classify(desc: string): string {
      const d = desc.toLowerCase();
      if (d.includes('series') || d.includes('fartlek') || /x\d/.test(d)) return 'series';
      if (d.includes('tempo') || d.includes('umbral')) return 'tempo';
      if (d.includes('largo')) return 'largo';
      if (d.includes('descanso')) return 'descanso';
      if (d.includes('suave') || d.includes('rodaje')) return 'suave';
      return 'otro';
    }

    function buildFallbackPlan(): PlanResponse {
      // Plan progresivo básico (8 semanas) con incremento en distancia del rodaje largo
      const days: PlanDay[] = [];
      const start = new Date(startISO + 'T00:00:00Z');
      const end = new Date(raceISO + 'T00:00:00Z');
      const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      const weeks = Math.ceil(totalDays / 7);
      // Ajuste del objetivo para variar intensidad
      const goalLower = (goal || '').toLowerCase();
      const speedFocus = /sub|menos de|bajar/.test(goalLower);
      for (let w = 0; w < weeks; w++) {
        const weekStart = new Date(start.getTime() + w * 7 * 86400000);
        const longRunKm = 10 + w * 1.5; // incrementa 1.5km por semana
        const tempoKm = 5 + Math.min(w, 4); // sube hasta +4 km
        const easyKm = 5 + Math.min(w, 3);
        const qualitySeries = speedFocus ? `Series: ${4 + w}x800m ritmo 5k` : `Fartlek ${30 + w * 5}min variando ritmos`;
        const pattern: string[] = [
          `Rodaje suave ${easyKm}km`,
          qualitySeries,
          'Descanso',
          `Tempo ${tempoKm}km ritmo controlado`,
          `Rodaje suave ${(easyKm + 1).toFixed(0)}km`,
          `Rodaje largo ${longRunKm.toFixed(0)}km`,
          'Descanso'
        ];
        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart.getTime() + d * 86400000);
          if (date > end) break;
            const description = pattern[d];
            const type = classify(description);
            let purpose: string = 'base aeróbica';
            let details: string = 'Rodaje cómodo en zona fácil.';
            let intensity: string | null = 'Z2';
            if (type === 'series') { purpose = 'VO2max / velocidad'; details = 'Calentar 10min, ejecutar las series indicadas, trote suave entre repeticiones, enfriar 10min.'; intensity = 'Ritmo 5k'; }
            else if (type === 'tempo') { purpose = 'Umbral / resistencia tempo'; details = 'Ritmo controlado mantenido, conversación entrecortada. Calienta y enfría 10min.'; intensity = 'Ritmo 10k-HM'; }
            else if (type === 'largo') { purpose = 'Resistencia aeróbica y eficiencia'; details = 'Ritmo cómodo estable, hidrata cada 20-25min.'; intensity = 'Z2 baja'; }
            else if (type === 'descanso') { purpose = 'Recuperación'; details = 'Sin carrera o actividad muy ligera (ej: paseo, movilidad).'; intensity = null; }
            else if (type === 'suave') { purpose = 'Desarrollo base y recuperación activa'; details = 'Ritmo conversacional relajado.'; intensity = 'Z2'; }
            days.push({ date: date.toISOString().split('T')[0], description, explanation: { type, purpose, details, intensity: intensity ?? undefined } });
        }
      }
      return { plan: days };
    }

    let rawContent: string | null = null;
    let attempts = 0;
    let openAiError: string | null = null;
    let usedModel: string | null = null;
    const candidateModels = [model, 'gpt-4o-mini', 'gpt-4o'];
    for (const m of candidateModels) {
      try {
        attempts++;
        rawContent = await callResponsesAPI(m);
        usedModel = m;
        console.log(`[${requestId}] OpenAI OK con modelo ${m}`);
        break;
      } catch (err) {
        openAiError = (err as Error).message;
        console.warn(`[${requestId}] Fallo modelo ${m}:`, openAiError);
      }
    }

    let parsedPlan: PlanResponse | null = null;
    if (rawContent) {
      // Extraer JSON puro
      const first = rawContent.indexOf('{');
      const last = rawContent.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        const jsonSlice = rawContent.slice(first, last + 1).trim();
        try {
          parsedPlan = JSON.parse(jsonSlice);
        } catch (e) {
          console.error(`[${requestId}] Parse fail snippet:`, jsonSlice.slice(0,120));
        }
      }
    }

    if (!parsedPlan || !parsedPlan.plan || !Array.isArray(parsedPlan.plan)) {
      console.log(`[${requestId}] Usando plan fallback programático`);
      parsedPlan = buildFallbackPlan();
      if (!usedModel) usedModel = 'fallback-generated';
    }

  // Validaciones de fechas básicas
  parsedPlan.plan.forEach(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error(`Fecha inválida en plan: ${d.date}`);
      if (typeof d.description !== 'string') throw new Error('Descripción inválida en un día');
      if (!d.explanation || typeof d.explanation !== 'object') {
        // Generar explicación mínima si el modelo no siguió formato
        const type = classify(d.description);
        d.explanation = { type, purpose: 'Entrenamiento', details: d.description };
      }
    });

  console.log(`[${requestId}] Plan listo. Días: ${parsedPlan.plan.length}, intentos: ${attempts}, fallback: ${rawContent ? 'no' : 'sí'}`);

  // Adjuntamos metadatos (el front sigue usando .plan)
  const responsePayload = { ...parsedPlan, meta: { attempts, fallback: !rawContent || usedModel === 'fallback-generated', openAiError, model: usedModel } };
  return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId },
    });
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    const resp = { error: message, requestId, timestamp: new Date().toISOString() };
    return new Response(JSON.stringify(resp), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId },
    });
  }
});

/* Local test (replace token accordingly):
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-plan' \
  --header 'Authorization: Bearer SERVICE_ROLE_OR_ANON' \
  --header 'Content-Type: application/json' \
  --data '{"race":{"name":"10K Ciudad","date":"2025-11-20","distance":10},"goal":"Bajar de 50 minutos"}'
*/
