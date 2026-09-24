# Specification Quality Checklist: Frontend del Observatorio — cliente que reemplaza la SPA actual

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-23
**Last validated**: 2026-09-24 (tras las 7 decisiones de la sesión de clarificación)
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

- El spec nombra rutas de API y tablas reales (`GET /api/organismos/:orgId/taxonomia`,
  `unidad_funcional_grupo_jueces`, etc.) — no como decisión de
  implementación, sino porque el Contexto documenta un hallazgo real
  verificado contra el código del backend (Principio VII), del mismo modo
  que los specs de `002`/`003`/`004`. El stack técnico (Vite/React/
  TypeScript/Tailwind/shadcn) solo aparece en el campo `Input` (la cita
  textual del pedido), no en ningún requisito ni criterio de éxito.
- **Hallazgo importante encontrado durante la escritura, no una decisión
  de alcance**: se verificó contra el código real de `002`/`003`/`004` que
  varios datos necesarios para las pantallas pedidas (catálogos de
  referencia, asignación UF↔jueces de D8, editores de organismo, catálogo
  completo de preguntas de taxonomía) no tienen ningún endpoint de backend
  todavía. Documentado en el Contexto y en Assumptions como una
  dependencia explícita de esta feature — no se expandió el alcance de
  "frontend" para incluir construirlos, ni se lo ocultó.
- **Corrección de cita**: el pedido original numeraba mal la
  correspondencia con `docs/expectativas-nueva-app.md` (decía "ítems 1,
  3, 5, 6, 8, 9, 10 fuera de alcance, no 2, 4, 7" pero la prosa que
  acompañaba esa cita correspondía en realidad a los ítems 2, 3, 4, 6, 8,
  9, 10). Se verificó el documento real y se corrigió en el spec
  (Assumptions), preservando la intención real del pedido (que la prosa
  dejaba clara sin ambigüedad) en vez de propagar la numeración
  incorrecta.
- 0 marcadores [NEEDS CLARIFICATION]: las ambigüedades reales encontradas
  (contenido concreto del menú de ajustes, criterio exacto de
  "completitud", generación de PDF en cliente vs. servidor) tenían un
  default razonable y de bajo riesgo — documentados en Assumptions, no
  bloquean el alcance de ninguna historia.
- Todos los ítems pasan en la primera iteración (2026-09-23).

## Revalidación 2026-09-24 (7 decisiones incorporadas)

Se revisó el spec completo contra cada ítem tras aplicar las decisiones.
Todos siguen pasando. Cambios verificados:

- **Contexto/Assumptions**: el "hallazgo" de endpoints faltantes se marcó
  como resuelto por `006` (ya mergeada); las brechas abiertas reales
  (cambio de rol, fijar contraseña, alta de usuarios por admin) se
  documentan como dependencia de `007`, fuera de alcance.
- **Decisión 1 (US9 solo lectura)**: US9 reescrita; nuevo escenario de
  control deshabilitado con explicación; FR-019 acotado.
- **Decisión 2 (mensaje genérico)**: US1 escenario 4, FR-002 y SC-008
  reescritos. Se deja registrado que resuelve el ítem 1 del backlog en
  sentido opuesto al previsto (no avisar la revocación, por seguridad).
- **Decisión 3 (fijar contraseña)**: US6 (nuevo escenario 4) y FR-014.
- **Decisión 4 (pools)**: US4 escenario 5, US5 escenario 4, FR-013, FR-024
  y SC-009.
- **Decisión 5 (sin registro público)**: FR-022 y Assumptions.
- **Decisión 6 (provincia)**: US2 escenarios 3-5 y FR-004.
- **Decisión 7 (taxonomía sin preguntas)**: US3 escenario 4, US7, FR-017,
  FR-023 y el criterio de completitud en Assumptions.
- 0 marcadores [NEEDS CLARIFICATION].
- Ítems que siguen sin marcarse como problema pero conviene tener presentes:
  - **Tensión conocida (decisión 5 vs. backend)**: la decisión dice que
    solo un admin crea usuarios, pero (a) esta feature no puede ofrecer esa
    pantalla —no hay endpoint— y (b) el backend hoy crea identidades al
    ingresar por Google/enlace y expone el alta con contraseña de su
    librería de auth. Está en Assumptions como dependencia explícita de
    `007`; no es un defecto del spec sino una consecuencia a decidir allí.
  - Los artefactos de plan (`plan.md`, `research.md`, `data-model.md`,
    `contracts/routes.md`, `quickstart.md`) se escribieron antes de estas
    decisiones y quedaron desactualizados en varios puntos (sección
    `/pools`, criterio de completitud, mensaje de login, pregunta 1-7
    abiertas). Hay que regenerarlos con `/speckit-plan`.
