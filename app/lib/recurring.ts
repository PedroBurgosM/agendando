import { localChileDateKey } from './dates';

export interface ScheduleRule {
  days: number[]; // 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb, 7=Dom
  time: string;
}

export interface GeneratedSessionSlot {
  date: string;
  time: string;
  dayName: string;
  label: string;
}

export const DAY_NAMES_SHORT: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

export function splitScheduleString(scheduleStr: string | null | undefined): string[] {
  if (!scheduleStr || typeof scheduleStr !== 'string') return [];
  const trimmed = scheduleStr.trim();
  if (!trimmed) return [];
  if (trimmed.includes('/')) {
    return trimmed.split(/\s*\/\s*/).filter(Boolean);
  }
  // Detect if multiple distinct time blocks exist (e.g. "Lun 15:00 - 16:00 y Mié 17:00 - 18:00" or "Lun 15:00, Mié 17:00")
  const timeBlocks = trimmed.match(/\b\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?\b/g) || [];
  if (timeBlocks.length > 1) {
    return trimmed.split(/\s*,\s*|(?<=\d{1,2}:\d{2})\s+(?:y|e)\s+(?=(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom))/i).filter(Boolean);
  }
  return [trimmed];
}

export function parseScheduleRules(scheduleStr: string | null | undefined): ScheduleRule[] {
  if (!scheduleStr || typeof scheduleStr !== 'string') return [];
  const parts = splitScheduleString(scheduleStr);
  const rules: ScheduleRule[] = [];

  for (const part of parts) {
    const timeMatch = part.match(/(\d{1,2}:\d{2})/);
    const time = timeMatch ? timeMatch[1].padStart(5, '0') : '18:00';
    const norm = part
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const days = new Set<number>();

    if (norm.includes('todos los dias')) {
      [1, 2, 3, 4, 5, 6, 7].forEach((d) => days.add(d));
    } else if (norm.includes('lunes a viernes') || norm.includes('lun a vie')) {
      [1, 2, 3, 4, 5].forEach((d) => days.add(d));
    } else if (norm.includes('sab y dom') || norm.includes('finde')) {
      [6, 7].forEach((d) => days.add(d));
    } else {
      if (/\blun(es)?\b/.test(norm)) days.add(1);
      if (/\bmar(tes)?\b/.test(norm)) days.add(2);
      if (/\bmie(rcoles)?\b/.test(norm)) days.add(3);
      if (/\bjue(ves)?\b/.test(norm)) days.add(4);
      if (/\bvie(rnes)?\b/.test(norm)) days.add(5);
      if (/\bsab(ado|ados)?\b/.test(norm)) days.add(6);
      if (/\bdom(ingo|ingos)?\b/.test(norm)) days.add(7);
    }

    rules.push({ days: Array.from(days).sort((a, b) => a - b), time });
  }

  return rules;
}

export function resolveTotalSessions(
  serviceName: string,
  billingPeriod?: string | null,
  rules: ScheduleRule[] = []
): number {
  const match = (serviceName || '').match(/(\d+)\s*(?:sesi[oó]n(?:es)?|clases?)/i);
  if (match) return parseInt(match[1], 10);

  if (billingPeriod === 'mensual') {
    const totalWeeklyDays = rules.reduce((acc, r) => acc + r.days.length, 0);
    return Math.max(1, (totalWeeklyDays || 1) * 4);
  }

  return 1;
}

export function calculateRecurringSessions(params: {
  serviceName: string;
  billingPeriod?: string | null;
  schedule?: string | null;
  startDate: string;
  startTime: string;
  maxSessions?: number;
}): GeneratedSessionSlot[] {
  const { serviceName, billingPeriod, schedule, startDate, startTime, maxSessions } = params;
  const rules = parseScheduleRules(schedule);
  const total = maxSessions || resolveTotalSessions(serviceName, billingPeriod, rules);

  if (total <= 1 || rules.length === 0) {
    const [y, m, d] = startDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const isoDay = dt.getDay() === 0 ? 7 : dt.getDay();
    const dayLabel = DAY_NAMES_SHORT[isoDay] || '';
    return [
      {
        date: startDate,
        time: startTime,
        dayName: dayLabel,
        label: `${dayLabel} ${startTime}`.trim(),
      },
    ];
  }

  const dayTimeMap = new Map<number, string>();
  for (const r of rules) {
    for (const day of r.days) {
      if (!dayTimeMap.has(day)) dayTimeMap.set(day, r.time);
    }
  }

  if (dayTimeMap.size === 0) {
    return [
      {
        date: startDate,
        time: startTime,
        dayName: '',
        label: startTime,
      },
    ];
  }

  const [y, m, d] = startDate.split('-').map(Number);
  const cur = new Date(y, m - 1, d);
  const sessions: GeneratedSessionSlot[] = [];
  let safetyLimit = 200;

  while (sessions.length < total && safetyLimit-- > 0) {
    const isoDay = cur.getDay() === 0 ? 7 : cur.getDay();
    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const isFirstSession = sessions.length === 0 && dateStr === startDate;

    if (isFirstSession || dayTimeMap.has(isoDay)) {
      // Si es la primera sesión y el usuario reasignó la hora, respetamos su horario reasignado
      const timeStr = isFirstSession ? (startTime || dayTimeMap.get(isoDay) || '18:00') : (dayTimeMap.get(isoDay) || startTime || '18:00');
      const dayLabel = DAY_NAMES_SHORT[isoDay] || '';
      sessions.push({
        date: dateStr,
        time: timeStr,
        dayName: dayLabel,
        label: `${dayLabel} ${timeStr}`,
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  return sessions.length > 0
    ? sessions
    : [
        {
          date: startDate,
          time: startTime,
          dayName: '',
          label: startTime,
        },
      ];
}

export function addMinutesToTime(timeStr: string, minutes: number): string {
  if (!timeStr || !timeStr.includes(':')) return '19:30';
  const [h, m] = timeStr.split(':').map(Number);
  const totalM = (h * 60 + m + minutes) % (24 * 60);
  const newH = Math.floor(totalM / 60);
  const newM = totalM % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function calculateMinutesBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr || !startStr.includes(':') || !endStr.includes(':')) return 0;
  const [h1, m1] = startStr.split(':').map(Number);
  const [h2, m2] = endStr.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

export interface ParsedSlot {
  label: string;
  date: string;
  time: string;
  dayName: string;
}

export function parseScheduleToSlots(scheduleStr: string | null | undefined, refDate = new Date()): ParsedSlot[] {
  if (!scheduleStr || typeof scheduleStr !== 'string') return [];
  const trimmed = scheduleStr.trim();
  if (!trimmed) return [];

  const parts = splitScheduleString(trimmed);
  const slots: ParsedSlot[] = [];

  const chileParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(refDate);
  const map = Object.fromEntries(chileParts.map(p => [p.type, p.value]));
  const refYear = Number(map.year);
  const refMonth = Number(map.month) - 1;
  const refDay = Number(map.day);
  const refHours = Number(map.hour);
  const refMinutes = Number(map.minute);

  for (const part of parts) {
    const timeMatch = part.match(/(\d{1,2}:\d{2})/);
    const startTime = timeMatch ? timeMatch[1].padStart(5, '0') : '18:00';
    const [startH, startM] = startTime.split(':').map(Number);

    const norm = part
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const targetDays = new Set<number>();

    if (norm.includes('todos los dias')) {
      [1, 2, 3, 4, 5, 6, 7].forEach((d) => targetDays.add(d));
    } else if (norm.includes('lunes a viernes') || norm.includes('lun a vie')) {
      [1, 2, 3, 4, 5].forEach((d) => targetDays.add(d));
    } else if (norm.includes('sab y dom') || norm.includes('finde')) {
      [6, 7].forEach((d) => targetDays.add(d));
    } else {
      if (/\blun(es)?\b/.test(norm)) targetDays.add(1);
      if (/\bmar(tes)?\b/.test(norm)) targetDays.add(2);
      if (/\bmie(rcoles)?\b/.test(norm)) targetDays.add(3);
      if (/\bjue(ves)?\b/.test(norm)) targetDays.add(4);
      if (/\bvie(rnes)?\b/.test(norm)) targetDays.add(5);
      if (/\bsab(ado|ados)?\b/.test(norm)) targetDays.add(6);
      if (/\bdom(ingo|ingos)?\b/.test(norm)) targetDays.add(7);
    }

    if (targetDays.size === 0) {
      const d = new Date(refYear, refMonth, refDay);
      if (refHours > startH || (refHours === startH && refMinutes >= startM)) {
        d.setDate(d.getDate() + 1);
      }
      slots.push({
        label: `${startTime} hrs`,
        date: localChileDateKey(d),
        time: startTime,
        dayName: 'Próxima sesión',
      });
      continue;
    }

    const chileDayOfWeek = new Date(Date.UTC(refYear, refMonth, refDay)).getUTCDay();
    const currentIsoDay = chileDayOfWeek === 0 ? 7 : chileDayOfWeek;

    for (const targetDay of Array.from(targetDays).sort()) {
      let daysAhead = targetDay - currentIsoDay;
      if (daysAhead < 0) {
        daysAhead += 7;
      } else if (daysAhead === 0) {
        if (refHours > startH || (refHours === startH && refMinutes >= startM)) {
          daysAhead = 7;
        }
      }

      const slotDate = new Date(refYear, refMonth, refDay + daysAhead);
      const dayLabel = DAY_NAMES_SHORT[targetDay] || '';
      slots.push({
        label: `${dayLabel} ${startTime}`,
        date: localChileDateKey(slotDate),
        time: startTime,
        dayName: dayLabel,
      });
    }
  }

  slots.sort((a, b) => a.date.localeCompare(b.date));
  return slots;
}

