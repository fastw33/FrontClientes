export function accessStep(session) {
  if (!session) return '/ingreso'
  if (session.usuario?.debe_cambiar_password || session.sesion?.tipo === 'PROVISIONAL')
    return '/primer-ingreso'
  if (!session.habilitado_para_operar || !session.terminos?.aceptado) return '/terminos'
  return '/inicio'
}

export function passwordIssues(password, confirmation) {
  const length = Array.from(password).length
  return {
    length: length >= 12 && length <= 128,
    matches: !!confirmation && password === confirmation,
  }
}

export function colombiaDate(value, withTime = true) {
  if (!value) return 'Sin información'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin información'
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}
