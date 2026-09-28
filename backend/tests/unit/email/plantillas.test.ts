// T007 (010, Foundational): las plantillas son texto puro — sin llamadas de red, sin config.
import { describe, expect, it } from 'vitest'
import { plantillaAccesoInicial, plantillaMagicLink } from '../../../src/email/plantillas.js'

const URL_PRUEBA = 'https://observatorio.example.test/primer-acceso#token=abc123'

describe('plantillaMagicLink', () => {
  it('incluye el url recibido como enlace, y un subject no vacío', () => {
    const { subject, html } = plantillaMagicLink({ url: URL_PRUEBA })
    expect(subject.trim().length).toBeGreaterThan(0)
    expect(html).toContain(`href="${URL_PRUEBA}"`)
  })

  it('el html cambia si cambia el url (no queda un valor fijo/memoizado)', () => {
    const a = plantillaMagicLink({ url: 'https://a.test/x' }).html
    const b = plantillaMagicLink({ url: 'https://b.test/y' }).html
    expect(a).not.toBe(b)
    expect(a).toContain('https://a.test/x')
    expect(b).toContain('https://b.test/y')
  })
})

describe('plantillaAccesoInicial', () => {
  it('incluye el url recibido como enlace, y un subject no vacío', () => {
    const { subject, html } = plantillaAccesoInicial({ url: URL_PRUEBA })
    expect(subject.trim().length).toBeGreaterThan(0)
    expect(html).toContain(`href="${URL_PRUEBA}"`)
  })

  it('no repite el fragmento del token fuera del propio enlace (no hay una segunda copia suelta)', () => {
    const { html } = plantillaAccesoInicial({ url: URL_PRUEBA })
    const apariciones = html.split('token=abc123').length - 1
    expect(apariciones).toBe(1) // solo dentro del href, no una segunda vez en texto plano
  })
})
