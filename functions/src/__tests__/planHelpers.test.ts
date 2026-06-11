import { describe, it, expect } from 'vitest';
import {
  computePhases,
  validateDayCompliance,
  buildFallbackMesocycle,
  estimateZones,
  phaseForWeek,
  type PlanDay,
  type FallbackMesocycleParams,
} from '../planHelpers';

// ── computePhases ─────────────────────────────────────────────

describe('computePhases', () => {
  it('returns taper-only for 1 week', () => {
    const phases = computePhases(1);
    expect(phases).toHaveLength(1);
    expect(phases[0].name).toBe('taper');
  });

  it('returns desarrollo+taper for 4 weeks', () => {
    const phases = computePhases(4);
    expect(phases.map(p => p.name)).toContain('taper');
    expect(phases.map(p => p.name)).toContain('desarrollo');
  });

  it('covers all weeks without gaps for 12-week plan', () => {
    const phases = computePhases(12);
    for (let w = 1; w <= 12; w++) {
      const phase = phaseForWeek(phases, w);
      expect(phase).toBeDefined();
    }
  });

  it('covers all weeks without gaps for 20-week plan', () => {
    const phases = computePhases(20);
    for (let w = 1; w <= 20; w++) {
      const phase = phaseForWeek(phases, w);
      expect(phase).toBeDefined();
    }
    // Last week should be taper
    expect(phaseForWeek(phases, 20).name).toBe('taper');
    // First week should be base
    expect(phaseForWeek(phases, 1).name).toBe('base');
  });

  it('last week is always taper for plans >= 6 weeks', () => {
    for (const weeks of [6, 8, 10, 12, 16, 20, 24]) {
      const phases = computePhases(weeks);
      expect(phaseForWeek(phases, weeks).name).toBe('taper');
    }
  });

  it('start/end weeks are contiguous', () => {
    const phases = computePhases(16);
    expect(phases[0].startWeek).toBe(1);
    expect(phases[phases.length - 1].endWeek).toBe(16);
  });
});

// ── estimateZones ─────────────────────────────────────────────

describe('estimateZones', () => {
  it('returns null for zero inputs', () => {
    expect(estimateZones(0, 10)).toBeNull();
    expect(estimateZones(3600, 0)).toBeNull();
  });

  it('returns zones for a 10k in 50 min (3000s)', () => {
    const zones = estimateZones(3000, 10);
    expect(zones).not.toBeNull();
    expect(zones!.z1).toMatch(/\d+:\d{2}\/km/);
    expect(zones!.z4).toMatch(/\d+:\d{2}\/km/);
    expect(zones!.z5).toMatch(/\d+:\d{2}\/km/);
    expect(zones!.race).toBe('5:00/km'); // 3000s / 10km = 300s/km = 5:00/km
  });

  it('z1 pace is slower (higher) than z4 which is slower than z5', () => {
    const zones = estimateZones(3000, 10)!;
    const toSec = (s: string) => {
      const [mm, ss] = s.replace('/km', '').split(':');
      return parseInt(mm) * 60 + parseInt(ss);
    };
    expect(toSec(zones.z1)).toBeGreaterThan(toSec(zones.z4));
    expect(toSec(zones.z4)).toBeGreaterThan(toSec(zones.z5));
  });
});

// ── validateDayCompliance ─────────────────────────────────────

describe('validateDayCompliance', () => {
  const makeWeek = (dates: string[], types: ('run' | 'strength' | 'rest')[]): PlanDay[] =>
    dates.map((date, i) => ({
      date,
      description: types[i] === 'rest' ? 'Descanso' : types[i] === 'strength' ? 'Fuerza' : 'Rodaje suave 8 km Z1',
    }));

  it('returns true when no constraints set', () => {
    // 2026-06-08 is Monday
    const plan = makeWeek(
      ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'],
      ['run', 'rest', 'run', 'rest', 'run', 'rest', 'rest'],
    );
    expect(validateDayCompliance(plan, null, null)).toBe(true);
  });

  it('returns true when running days match runDaysOfWeek', () => {
    // 2026-06-08=Mon(1), 2026-06-10=Wed(3), 2026-06-12=Fri(5)
    const plan = makeWeek(
      ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'],
      ['run', 'rest', 'run', 'rest', 'run', 'rest', 'rest'],
    );
    expect(validateDayCompliance(plan, [1, 3, 5], null)).toBe(true);
  });

  it('returns false when running happens on wrong days', () => {
    // All runs on Mon/Tue/Wed but constraint says only Mon/Wed/Fri
    const plan = makeWeek(
      ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'],
      ['run', 'run', 'run', 'rest', 'rest', 'rest', 'rest'],
    );
    expect(validateDayCompliance(plan, [1, 3, 5], null)).toBe(false);
  });
});

// ── buildFallbackMesocycle ────────────────────────────────────

describe('buildFallbackMesocycle', () => {
  const baseParams: FallbackMesocycleParams = {
    startISO: '2026-06-15',
    endISO:   '2026-07-12',
    totalWeeks: 12,
    mesocycleStartWeek: 1,
    phases: computePhases(12),
    taperWeeks: 2,
    runDays: 4,
    runDaysOfWeek: null,
    includeStrength: false,
    strengthDaysOfWeek: null,
    strengthDaysCount: 0,
    distKm: 10,
    methodology: 'polarized',
    zones: null,
  };

  it('generates a plan array', () => {
    const { plan } = buildFallbackMesocycle(baseParams);
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('every day has a date and description', () => {
    const { plan } = buildFallbackMesocycle(baseParams);
    for (const day of plan) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof day.description).toBe('string');
      expect(day.description.length).toBeGreaterThan(0);
    }
  });

  it('respects specific runDaysOfWeek', () => {
    const params: FallbackMesocycleParams = {
      ...baseParams,
      runDaysOfWeek: [1, 3, 5, 6], // Mon, Wed, Fri, Sat
    };
    const { plan } = buildFallbackMesocycle(params);
    const allowedDays = [0, 1, 3, 5, 6]; // 0=Sun allowed for rest
    for (const day of plan) {
      const dow = new Date(day.date + 'T00:00:00Z').getUTCDay();
      const isRun = !/descanso|rest|fuerza/i.test(day.description);
      if (isRun) {
        expect(params.runDaysOfWeek).toContain(dow);
        void allowedDays; // used for documentation clarity
      }
    }
  });

  it('includes strength days when includeStrength=true', () => {
    const params: FallbackMesocycleParams = {
      ...baseParams,
      includeStrength: true,
      strengthDaysCount: 2,
    };
    const { plan } = buildFallbackMesocycle(params);
    const hasStrength = plan.some(d => /fuerza/i.test(d.description));
    expect(hasStrength).toBe(true);
  });

  it('dates are within start–end range', () => {
    const { plan } = buildFallbackMesocycle(baseParams);
    for (const day of plan) {
      expect(day.date >= baseParams.startISO).toBe(true);
      expect(day.date <= baseParams.endISO).toBe(true);
    }
  });

  it('dates are in ascending order', () => {
    const { plan } = buildFallbackMesocycle(baseParams);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].date >= plan[i - 1].date).toBe(true);
    }
  });
});
