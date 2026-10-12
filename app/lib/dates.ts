/**
 * Parsea una fecha ('YYYY-MM-DD') y hora ('HH:mm') en la zona horaria de Chile ('America/Santiago')
 * convirtiéndola correctamente a UTC, respetando automáticamente tanto horario de invierno (UTC-4) como de verano (UTC-3).
 */
export function parseChileDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(guessUtc)
      .map(p => [p.type, p.value])
  );
  const asIfUtc = new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second)
    )
  );
  const offsetMs = guessUtc.getTime() - asIfUtc.getTime();
  return new Date(guessUtc.getTime() + offsetMs);
}
