import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextArrival, arrivalTimes, hasOperatingHours } from '../src/utils/operationSchedule.js'
const hours = { inicio: '08:00', fin: '17:00', zona_horaria: 'America/Bogota' }
const timestamp = (value) => +new Date(value)
test('Horario de Colombia: antes de abrir, cierre exacto y paso al día siguiente', () => {
  assert.equal(nextArrival(timestamp('2026-10-20T07:30:00-05:00'), hours), '2026-10-20T08:00')
  assert.equal(nextArrival(timestamp('2026-10-20T17:00:00-05:00'), hours), '2026-10-20T17:00')
  assert.equal(nextArrival(timestamp('2026-10-20T17:00:00.001-05:00'), hours), '2026-10-21T08:00')
  assert.equal(nextArrival(timestamp('2026-12-31T23:00:00-05:00'), hours), '2027-01-01T08:00')
  assert.equal(nextArrival(timestamp('2026-10-20T23:00:00Z'), hours), '2026-10-21T08:00')
})
test('Solo ofrece minutos válidos, respeta anticipación y no amplía el cierre', () => {
  const full = arrivalTimes(
    '2026-10-21',
    timestamp('2026-10-20T16:50:00-05:00') + 300 * 60000,
    hours,
  )
  assert.equal(full.length, 541)
  assert.equal(full[0], '08:00')
  assert.equal(full.at(-1), '17:00')
  assert.deepEqual(
    arrivalTimes('2026-10-20', timestamp('2026-10-20T12:00:00-05:00') + 300 * 60000, hours),
    ['17:00'],
  )
  assert.deepEqual(
    arrivalTimes('2026-10-20', timestamp('2026-10-20T12:00:00.001-05:00') + 300 * 60000, hours),
    [],
  )
  assert.equal(
    arrivalTimes('2026-10-20', timestamp('2026-10-20T14:23:20-05:00'), hours)[0],
    '14:24',
  )
  assert.equal(hasOperatingHours({ ...hours, fin: '07:00' }), false)
  assert.equal(hasOperatingHours(null), false)
  assert.deepEqual(arrivalTimes('2026-10-20', 0, null), [])
})
