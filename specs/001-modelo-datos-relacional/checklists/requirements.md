# Specification Quality Checklist: Modelo de datos relacional y migración desde Firestore

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-07
**Updated**: 2026-09-08 (D8 cerrada: relación UF↔jueces por tabla puente de asignaciones, reemplaza el modelo de tres estados de D6; SC-007 corregido: cero / una / varias asignaciones son todas válidas)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- **Verificación de altitud (chequeo de "no implementación")**: se cuidó
  explícitamente que la spec no eligiera motor de base de datos, tipos de columna,
  ni stack. Donde el tema aparece (cálculo de `fuero_simplificado` en FR-012,
  materialización de vocabularios en FR-024, nulidad/tipos en FR-028), la spec
  declara el requisito lógico y **difiere** la decisión de implementación a
  `/speckit-plan`. Esto es intencional y consistente con el alcance pedido.
- **Dependencia de verificación: satisfecha (2026-09-07)**. La verificación de
  `docs/verificacion-datos-firestore.md` ya se corrió; sus resultados están en
  `docs/resultado-verificacion-general-20260907.md` y
  `docs/resultado-verificacion-fueros-20260907.md`. Las decisiones finas (nulidad,
  tipos canónicos, volumen de referencias rotas) dejaron de estar condicionadas: la
  spec incorpora los números reales (Principio VII). Solo los tipos de columna
  concretos se difieren a `/speckit-plan`.
- **Supuestos de modelado confirmados con datos reales**: taxonomía 1:1 (V0.3/V7.2:
  0 excepciones, 88/88 completas), identidad de usuario D4 (V1.1: 0 colisiones de
  email — id subrogado por diseño hacia adelante, sin nada que limpiar), integridad
  referencial (V1.10/V2.13/V3.9/V3.10/V3.11: 0 referencias rotas), `legacy_id`
  (V2.11: siempre string numérico o null) y `actualizado_a` (V2.9: 115 Timestamp +
  1 string ISO). Assumptions, Edge Cases y las FR/SC correspondientes se
  reescribieron para reflejarlos en vez de estimaciones.
- **Fueros: supuesto confirmado (2026-09-07)**: `docs/resultado-verificacion-fueros-20260907.md`
  cerró el supuesto del catálogo de fueros con datos reales de producción — 116
  organismos, 0 sin `fuero_simplificado`, cinco valores (penal 41, civil 31,
  multifuero 20, laboral 13, familia 11). Assumptions, US5, FR-013/FR-014 y SC-006
  se actualizaron: `sin_fueros_asignados` = 0 casos en la carga inicial (se
  mantiene para altas futuras) y `multifuero_sin_detalle` = 20 casos confirmados
  (ya no una estimación).
- **D7 cerrada e incorporada (2026-09-07)**: D7 fija `anio_implementacion` como una
  única columna entera nullable con regla de extracción de año (FR-015, FR-027),
  incluido el caso ambiguo "2015. Refuncionalización 2024" → 2015.
- **D8 cerrada e incorporada (2026-09-08) — reemplaza el modelo de tres estados de
  D6**: la relación UF↔jueces pasa de tres estados excluyentes (cantidad directa /
  pool / `no_aplica`) a una **tabla puente de asignaciones** UF↔Grupo de Jueces con
  cantidad por fila (FR-017 reescrito, FR-018 reescrito, FR-020 generalizado a "Grupo
  de Jueces", FR-025, Key Entities con nueva entidad "Asignación de Jueces", Edge
  Cases, US1 escenarios 4-5, SC-007). Puntos cubiertos: una UF puede tener varias
  asignaciones (varios pools, pool + grupo propio, o subconjunto de un pool); solo se
  registran cantidades, no jueces por nombre; `no_aplica` = cero asignaciones
  (distinguible de dato faltante, V3.3: 2 UF administrativas); dos reglas de conteo
  (por UF sin deduplicar vs. agregado contando cada grupo una vez por su total real —
  ejemplo 13/5/10 por UF, 20 agregado); fuero por asignación (hereda los de la UF,
  acotable, nunca excedente; agregación por fuero por asignación). La migración
  inicial produce a lo sumo una asignación por UF (los casos multi-pool/subconjunto
  son conocimiento de dominio para carga futura, 0 en los datos actuales).
  **Corrección SC-007 (2026-09-08)**: se quitó "el resto con exactamente una
  asignación" —contradecía a D8 y al propio ejemplo del criterio (UF1 con tres
  asignaciones)— y también la cláusula de "estado prohibido"/"exclusividad" de una
  revisión intermedia, que era incorrecta: cero asignaciones **no** es un estado
  prohibido sino el estado válido y esperado de los organismos administrativos
  (D6/D8, 2 casos confirmados). En el modelo nuevo no hay un campo separado de
  cantidad directa que pueda entrar en conflicto con las filas de la tabla puente
  —todo son filas de esa tabla—, así que no existe ningún estado prohibido. SC-007
  queda sin cláusula de exclusividad: 2 UF con cero asignaciones y 275 con una o más,
  en cualquier combinación (exclusivas, pools completos o subconjuntos).
