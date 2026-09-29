# Specification Quality Checklist: Editar los fueros de un organismo

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-28
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

- No hizo falta ninguna clarificación: el pedido original ya fijaba
  alcance, autorización y fuera-de-alcance con precisión.
- Un caso no mencionado explícitamente en el pedido se agregó como
  Historia 2 con un default razonable, en vez de preguntar: quitar un
  fuero que una asignación de jueces (`asignacion_fueros`) ya acota
  específicamente debe rechazarse, no aplicarse en silencio — mismo
  criterio que ya usa el proyecto para "no borrar/romper algo en uso" en
  otros lados (D8, pool en uso). Verificado contra el esquema real
  (`db/schema.sql`): existe un trigger que ya impone que
  `asignacion_fueros` sea subconjunto de `organismo_fueros` en el sentido
  INSERT/UPDATE, pero nada impide hoy un DELETE del lado de
  `organismo_fueros` que deje una asignación apuntando a un fuero ya no
  declarado — FR-004/SC-003 lo cierran del lado de la nueva funcionalidad.
- Relleno inicial (Assumptions): el usuario pidió sumarlo describiendo un
  caso ("cargado" sin ninguna fila en el listado) que, verificado contra
  la base real, no existe hoy (los 97 organismos "cargado" ya tienen
  fila) — confirmado con el usuario antes de escribirlo: se documenta
  igual como la regla correcta (no-op hoy), no se omite ni se inventa que
  sí aplica.
- `estado_fueros_enum` (`cargado` | `multifuero_sin_detalle` |
  `sin_fueros_asignados`) es el mecanismo real detrás de FR-005: guardar
  un listado (vacío o no) a través de esta pantalla es la única forma
  prevista de sacar a un organismo de `multifuero_sin_detalle`. La forma
  exacta de esa transición es decisión de `/speckit-plan`, no de esta
  spec.
