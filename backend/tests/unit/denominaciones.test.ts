import { describe, expect, it } from 'vitest'
import { normalizarDenominacion } from '../../src/util/denominaciones.js'

describe('normalizarDenominacion', () => {
  it('capitaliza palabra por palabra y baja las que ya estaban en mayúscula sostenida', () => {
    expect(normalizarDenominacion('AREA DE RECEPCION CENTRALIZADA')).toBe('Area de Recepcion Centralizada')
    expect(normalizarDenominacion('MESA DE ENTRADAS DEL FUERO LABORAL')).toBe('Mesa de Entradas del Fuero Laboral')
  })

  it('las preposiciones/artículos/conjunciones van en minúscula salvo que sean la primera palabra', () => {
    expect(normalizarDenominacion('OFICINA DE GESTIÓN DE LOS JUZGADOS')).toBe('Oficina de Gestión de los Juzgados')
    expect(normalizarDenominacion('los juzgados de familia')).toBe('Los Juzgados de Familia') // primera palabra: SÍ se capitaliza
    // y/e/o/u (sumadas al pedido original, confirmado con el usuario): si no, "Civil y Comercial" -> "Civil Y Comercial".
    expect(normalizarDenominacion('CIVIL Y COMERCIAL')).toBe('Civil y Comercial')
    // a/al (mismo motivo, casos reales de la base: organismos#319/#334, unidades_funcionales#775).
    expect(normalizarDenominacion('Dirección de Asistencia a Impugnación y Coordinación General')).toBe(
      'Dirección de Asistencia a Impugnación y Coordinación General',
    )
    expect(normalizarDenominacion('Oficina de Control de suspensiones de juicio y proceso a prueba')).toBe(
      'Oficina de Control de Suspensiones de Juicio y Proceso a Prueba',
    )
    expect(normalizarDenominacion('OFICINA DE ASISTENCIA AL JUEZ DE CONTROL')).toBe('Oficina de Asistencia al Juez de Control')
  })

  it('la sigla OGA (y sus variantes reales OGAL/OGAP) queda siempre en mayúscula sostenida', () => {
    expect(normalizarDenominacion('OGA CIVIL')).toBe('OGA Civil')
    expect(normalizarDenominacion('oga civil')).toBe('OGA Civil') // mismo resultado venga como venga cargada
    expect(normalizarDenominacion('OGAP (Fuero Penal)')).toBe('OGAP (Fuero Penal)')
    expect(normalizarDenominacion('OGAL (Fuero Laboral)')).toBe('OGAL (Fuero Laboral)')
    expect(normalizarDenominacion('Coordinación OGA (Penal)')).toBe('Coordinación OGA (Penal)')
  })

  it('el plural de OGA conserva la "s" final en minúscula', () => {
    expect(normalizarDenominacion('OFICINA PROVINCIAL DE COORDINACIÓN Y CONTROL DE GESTIÓN DE OGAS')).toBe(
      'Oficina Provincial de Coordinación y Control de Gestión de OGAs',
    )
  })

  // Lista ampliada tras revisar el primer diff completo (confirmado con el usuario): mismo
  // tratamiento que OGA para estas once siglas — nunca se capitalizan como palabra normal.
  it('OFIJU, OTIC, OTICCA, OTIF, OTIL, OTRAF, OGJ, OCE, OPS, TGA y OSPRO también quedan sostenidas', () => {
    expect(normalizarDenominacion('OFICINA JUDICIAL CIVIL (OFIJU)')).toBe('Oficina Judicial Civil (OFIJU)')
    expect(normalizarDenominacion('OFIJU - Oficina Judicial Penales')).toBe('OFIJU - Oficina Judicial Penales')
    expect(normalizarDenominacion('Oficina de Tramitación Integral Civil (otic)')).toBe('Oficina de Tramitación Integral Civil (OTIC)')
    expect(normalizarDenominacion('oficina de tramitación integral civil y contencioso administrativo (oticca)')).toBe(
      'Oficina de Tramitación Integral Civil y Contencioso Administrativo (OTICCA)',
    )
    expect(normalizarDenominacion('OFICINA DE TRAMITES DE LOS JUZGADOS DE FAMILIA (OTRAF)')).toBe(
      'Oficina de Tramites de los Juzgados de Familia (OTRAF)',
    )
    expect(normalizarDenominacion('Oficina de Tramitación Integral Laboral (otil)')).toBe('Oficina de Tramitación Integral Laboral (OTIL)')
    expect(normalizarDenominacion('Oficina de Tramitación Integral del Fuero de Familia (otif)')).toBe(
      'Oficina de Tramitación Integral del Fuero de Familia (OTIF)',
    )
    expect(normalizarDenominacion('Oficina de Gestión Judicial (ogj)')).toBe('Oficina de Gestión Judicial (OGJ)')
    expect(normalizarDenominacion('Oficina de Coordinación Estratégica de Planificación y Gestión (oce)')).toBe(
      'Oficina de Coordinación Estratégica de Planificación y Gestión (OCE)',
    )
    expect(normalizarDenominacion('OFICINA DE PROCESOS SUCESORIOS (OPS)')).toBe('Oficina de Procesos Sucesorios (OPS)')
    expect(normalizarDenominacion('TRIBUNAL DE GESTIÓN ASOCIADA DE CONCILIACIÓN Y TRABAJO (TGA CYT)')).toBe(
      'Tribunal de Gestión Asociada de Conciliación y Trabajo (TGA Cyt)',
    )
    expect(normalizarDenominacion('OFICINA DE SERVICIOS PROCESALES | OSPRO')).toBe('Oficina de Servicios Procesales | OSPRO')
    expect(normalizarDenominacion('OFIGA Oficina Judicial de Gestión Asociada de Procesos Sucesorios')).toBe(
      'OFIGA Oficina Judicial de Gestión Asociada de Procesos Sucesorios',
    )
  })

  it('una sigla que NO está en la lista ampliada se sigue capitalizando como palabra normal', () => {
    // Caso límite señalado en el pedido original: "OGUs" NO es una variante de OGA (tercera letra
    // distinta: OGU vs OGA), así que cae bajo la regla general.
    expect(normalizarDenominacion('Coordinación Provincial de OGUs')).toBe('Coordinación Provincial de Ogus')
    // DAIyCG, GEJUAS, OMAS y OFIJUP tampoco están en la lista (no las pidió el usuario).
    expect(normalizarDenominacion('Dirección de Asistencia a Impugnación y Coordinación General (DAIyCG)')).toBe(
      'Dirección de Asistencia a Impugnación y Coordinación General (Daiycg)',
    )
    expect(normalizarDenominacion('OFICINA JUDICIAL PENAL (OFIJUP)')).toBe('Oficina Judicial Penal (Ofijup)')
  })

  it('preserva tokens que no empiezan con letra (dígitos, códigos) sin forzar mayúscula', () => {
    expect(normalizarDenominacion('Oficina de Gestión Asociada Multifueros N°1')).toBe(
      'Oficina de Gestión Asociada Multifueros N°1',
    )
    expect(normalizarDenominacion('OFICINA JUDICIAL MULTIFUERO - 2da. Circunscripción Judicial')).toBe(
      'Oficina Judicial Multifuero - 2da. Circunscripción Judicial',
    )
    // organismos#297: Santi decidió no excluirlo, y sumar LP ("Ley Provincial") a la lista de siglas
    // sostenidas — el "754-O" sigue bajando a minúscula (no es una sigla, es un número de norma).
    expect(normalizarDenominacion('SISTEMA MIXTO- LP N° 754-O (OFIJU - MIXTO)')).toBe(
      'Sistema Mixto- LP N° 754-o (OFIJU - Mixto)',
    )
  })

  it('colapsa espacios repetidos y recorta los de los extremos (mismo "error de carga")', () => {
    expect(normalizarDenominacion('  Oficina de Gestión Unificada Civil y Comercial  ')).toBe(
      'Oficina de Gestión Unificada Civil y Comercial',
    )
    expect(normalizarDenominacion('Oficina de Gestión Asociada de Familia y  Sucesiones')).toBe(
      'Oficina de Gestión Asociada de Familia y Sucesiones',
    ) // doble espacio antes de "Sucesiones" en el original
  })

  it('es idempotente: normalizar dos veces da el mismo resultado', () => {
    const casos = [
      'OGA CIVIL',
      'OFICINA JUDICIAL CIVIL (OFIJU)',
      'Oficina Provincial de Coordinación y Control de gestión de OGAs',
      'OGAP (Fuero Penal)',
    ]
    for (const c of casos) {
      const una = normalizarDenominacion(c)
      expect(normalizarDenominacion(una)).toBe(una)
    }
  })

  it('cadena vacía o solo espacios: no rompe', () => {
    expect(normalizarDenominacion('')).toBe('')
    expect(normalizarDenominacion('   ')).toBe('')
  })
})
