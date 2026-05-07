export interface ParsedExercise {
  sets?: string;
  reps?: string;
  name: string;
  notes?: string;
}

export function parseExercises(raw: string): ParsedExercise[] {
  return raw
    .split('\n')
    .map(l => l.trim().replace(/^[-*•·]\s*/, ''))
    .filter(Boolean)
    .map(line => {
      // "3x12 Sentadillas" or "3×12 Peso muerto"
      const m1 = line.match(/^(\d+)\s*[x×]\s*(\d+(?:[–\-]\d+)?)\s+(.+?)(?:\s*[(\[](.+?)[)\]])?$/i);
      if (m1) return { sets: m1[1], reps: m1[2], name: m1[3].trim(), notes: m1[4] };
      // "3 series de 12 Sentadillas" / "3 series 12 reps Flexiones"
      const m2 = line.match(/^(\d+)\s+series?\s+(?:de\s+)?(\d+(?:[–\-]\d+)?)\s*(?:reps?|repeticiones?)?\s*(?:[-–:de]\s+)?(.+)/i);
      if (m2) return { sets: m2[1], reps: m2[2], name: m2[3].trim() };
      return { name: line };
    });
}
