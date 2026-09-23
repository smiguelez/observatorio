# Specification Quality Checklist: Endpoint de taxonomía de organismos, reconstruido para el modelo parametrizable

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-22
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

- El spec nombra la ruta HTTP existente (`GET/PUT /api/organismos/:orgId/taxonomia`,
  y ahora también `PATCH /api/organismos/:id` para la Protección B) y
  nombres de tablas del esquema ya cerrado en `003-taxonomia-parametrizable`
  (`taxonomia_preguntas`, `taxonomia_opciones`, `evaluaciones_taxonomicas`) —
  no como una decisión de implementación nueva, sino porque esta feature es
  literalmente la corrección de un endpoint y un esquema ya existentes y
  nombrados en `docs/decisiones-pendientes.md` (D11) y en los Edge Cases de
  `003-taxonomia-parametrizable`; es la misma convención ya usada en los
  specs de `002` y `003` de este proyecto (Principio VII: fundamentar
  contra el sistema real, no contra abstracciones).
- 0 marcadores [NEEDS CLARIFICATION], incluida la ampliación de alcance
  (2026-09-22, Protecciones A y B): el usuario especificó ambas
  protecciones con suficiente detalle (mecanismo, momento de aplicación,
  forma del error, decisión explícita de no versionar/archivar) como para
  no dejar ninguna ambigüedad de alcance abierta.
- **Revisado tras la ampliación de alcance**: se encontró y corrigió una
  contradicción real entre el spec original y la Protección A — el FR-014
  y un Edge Case originales afirmaban que el campo "tipo de organismo
  aplicable" nunca sería restrictivo para escritura (heredado sin
  cuestionar del criterio de `003-taxonomia-parametrizable` para datos ya
  existentes). La Protección A invierte eso específicamente para
  escrituras nuevas. Se reescribieron FR-014, el Edge Case
  correspondiente, y la Assumption relacionada para distinguir
  explícitamente "dato ya existente" (sigue sin restricción,
  `003-taxonomia-parametrizable` FR-012 intacto) de "escritura nueva"
  (restringida desde esta feature) — ya no hay dos requisitos
  contradictorios en el mismo documento.
- Todos los ítems pasan tras esa corrección.
