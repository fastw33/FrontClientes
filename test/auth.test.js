import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accessStep, colombiaDate, passwordIssues } from '../src/utils/auth.js'

test('El primer ingreso no puede saltarse cambio de contraseña ni consentimiento', () => {
  const session = {
    usuario: { debe_cambiar_password: false },
    sesion: { tipo: 'NORMAL' },
    habilitado_para_operar: true,
    terminos: { aceptado: true },
  }
  assert.equal(accessStep(null), '/ingreso')
  assert.equal(
    accessStep({ ...session, usuario: { debe_cambiar_password: true } }),
    '/primer-ingreso',
  )
  assert.equal(accessStep({ ...session, sesion: { tipo: 'PROVISIONAL' } }), '/primer-ingreso')
  assert.equal(accessStep({ ...session, terminos: { aceptado: false } }), '/terminos')
  assert.equal(accessStep({ ...session, habilitado_para_operar: false }), '/terminos')
  assert.equal(accessStep(session), '/inicio')
})

test('Las contraseñas Unicode se miden por caracteres y no se recortan', () => {
  assert.equal(passwordIssues('🦊'.repeat(7), '🦊'.repeat(7)).length, false)
  assert.equal(passwordIssues('🦊'.repeat(12), '🦊'.repeat(12)).length, true)
  assert.equal(passwordIssues(' '.repeat(12), ' '.repeat(12)).matches, true)
  assert.equal(passwordIssues('A'.repeat(129), 'A'.repeat(129)).length, false)
  assert.equal(passwordIssues('ContraseñaValida123', 'ContraseñaValida123 ').matches, false)
})

test('Las fechas se presentan en Colombia independientemente de la zona del equipo', () => {
  assert.match(colombiaDate('2026-10-20T02:00:00.000Z', false), /^19 /)
  assert.equal(colombiaDate('fecha-invalida'), 'Sin información')
})
