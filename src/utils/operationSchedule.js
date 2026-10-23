export const localDate = (ms) => new Date(ms - 5 * 3600000).toISOString().slice(0, 16)
export function hasOperatingHours(hours) {
  const valid = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  return Boolean(
    hours &&
    valid(hours.inicio) &&
    valid(hours.fin) &&
    hours.inicio < hours.fin &&
    hours.zona_horaria === 'America/Bogota',
  )
}
export function nextArrival(earliest, hours) {
  if (!hasOperatingHours(hours) || !Number.isFinite(earliest)) return ''
  const local = localDate(Math.ceil(earliest / 60000) * 60000)
  const day = local.slice(0, 10),
    time = local.slice(11)
  if (time < hours.inicio) return `${day}T${hours.inicio}`
  if (time <= hours.fin) return local
  const nextDay = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
  return `${nextDay}T${hours.inicio}`
}
export function arrivalTimes(day, earliest, hours) {
  if (!hasOperatingHours(hours) || !/^\d{4}-\d\d-\d\d$/.test(day)) return []
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const times = []
  for (let index = minutes(hours.inicio); index <= minutes(hours.fin); index++) {
    const time = `${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`
    if (+new Date(`${day}T${time}:00-05:00`) >= earliest) times.push(time)
  }
  return times
}
export const timeLabel = (time) =>
  new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(`2026-01-01T${time}:00-05:00`))
