import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Clock3 } from 'lucide-react'
import { timeLabel } from '../utils/operationSchedule'
import './ArrivalTimePicker.css'

const normalize = (value) => value.toLowerCase().replace(/[.\s]/g, '').replace(/^0/, '')

export function ArrivalTimePicker({ times, value, onChange }) {
  const id = useId(),
    input = useRef(null),
    list = useRef(null),
    popup = useRef(null)
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [active, setActive] = useState(0)
  const [position, setPosition] = useState({ above: false, height: 215 })
  const valid = times.includes(value)
  const options = useMemo(() => {
    const search = normalize(query)
    return times.filter((time) =>
      search
        ? normalize(time).startsWith(search) || normalize(timeLabel(time)).startsWith(search)
        : time.endsWith(':00') ||
          time.endsWith(':15') ||
          time.endsWith(':30') ||
          time.endsWith(':45') ||
          time === value ||
          time === times[0],
    )
  }, [times, value, query])
  useLayoutEffect(() => {
    if (!open || !popup.current || !list.current) return
    const field = input.current.closest('.arrival-time-picker').getBoundingClientRect()
    const body = input.current.closest('.modal-body-scroll')?.getBoundingClientRect()
    if (!body) return
    const below = body.bottom - field.bottom - 9,
      above = field.top - body.top - 9,
      chrome =
        popup.current.getBoundingClientRect().height - list.current.getBoundingClientRect().height,
      flip = below < chrome + 180 && above > below
    setPosition({
      above: flip,
      height: Math.max(0, Math.min(215, Math.floor((flip ? above : below) - chrome))),
    })
  }, [open, query, options.length])
  useEffect(() => {
    if (!open || !list.current) return
    const option = list.current.querySelector('[data-active="true"]')
    if (!option) return
    // Desplaza únicamente las opciones; no mueve el formulario ni su encabezado.
    const item = option.getBoundingClientRect(),
      bounds = list.current.getBoundingClientRect()
    if (item.top < bounds.top) list.current.scrollTop -= bounds.top - item.top
    else if (item.bottom > bounds.bottom) list.current.scrollTop += item.bottom - bounds.bottom
  }, [active, open])
  function show() {
    setQuery('')
    setActive(0)
    setOpen(true)
  }
  function choose(time) {
    onChange(time)
    setOpen(false)
    setQuery('')
  }
  function keyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) show()
      else
        setActive((index) =>
          Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))),
        )
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (options[active]) choose(options[active])
    }
  }
  return (
    <div className="arrival-time-picker">
      <label htmlFor={id}>Hora de llegada</label>
      <div className="arrival-time-input">
        <Clock3 size={18} aria-hidden="true" />
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id + '-list' : undefined}
          aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          placeholder={
            !times.length ? 'Sin horas disponibles' : open ? 'Buscar hora…' : 'Selecciona una hora'
          }
          disabled={!times.length}
          required
          value={open ? query : valid ? timeLabel(value) : ''}
          onFocus={show}
          onClick={() => {
            if (!open) show()
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={keyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Mostrar horas disponibles"
          disabled={!times.length}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) setOpen(false)
            else {
              input.current?.focus()
              show()
            }
          }}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div
          ref={popup}
          className={`arrival-time-popup${position.above ? ' arrival-time-popup-above' : ''}`}
          style={{ '--arrival-options-height': `${position.height}px` }}
        >
          <p>HORAS DISPONIBLES</p>
          <ul id={id + '-list'} ref={list} role="listbox" aria-label="Horas disponibles">
            {options.map((time, index) => (
              <li
                key={time}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={time === value}
                data-active={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(time)}
              >
                <span>{timeLabel(time)}</span>
                {time === value && <Check size={16} aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {!options.length && (
            <div className="arrival-time-empty" role="status">
              No hay horas disponibles para esa búsqueda.
            </div>
          )}
          <small>Para elegir un minuto exacto, escribe la hora. Ej. 10:07.</small>
        </div>
      )}
    </div>
  )
}
