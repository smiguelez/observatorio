# Specification Quality Checklist: Backend de identidad y autorización (007)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
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

- **Referencias técnicas toleradas, no decisiones de implementación**: el spec
  nombra los códigos `401`/`403` y "triggers de taxonomía" porque el pedido los
  exige textualmente (403 explícito, D18) y `002`/`005`/`006` los usan como
  parte del contrato observable; no dice **cómo** se implementa nada (ni el
  mecanismo del hook, ni el formato del acceso inicial, ni cómo se traducen los
  errores). SC-004 y SC-006 mencionan `403` por la misma razón.
- **Hallazgo nuevo verificado al escribir el spec (amplía el pedido literal)**:
  el pedido de D14 cierra el alta de emails **no** provisionados, pero el
  alta pública por contraseña sobre un email **ya provisionado** que nunca
  ingresó también permite quedarse con la cuenta. Se comprobó contra el backend
  real el 2026-09-25 con un usuario de prueba (`200` y sesión iniciada como ese
  usuario; datos de la prueba eliminados). Está como **FR-004 / SC-003 /
  US1-5**. No estaba en la lista del pedido: conviene confirmarlo.
- **Decisiones por defecto tomadas (documentadas en Assumptions; ninguna llegó
  a [NEEDS CLARIFICATION] porque tienen un default razonable y de bajo
  riesgo)**, las tres primeras se apartan un poco de la letra del pedido:
  1. **FR-010**: un no admin que reenvía su provincia **actual** no es
     rechazado (no hay cambio que rechazar y nada se ignora). Motivo: el
     formulario de perfil de `005` la envía siempre; rechazarla rompería ese
     cliente hasta la Fase B sin cerrar ningún camino adicional. Un intento de
     **cambio** sí da `403` y se rechaza completo (FR-009).
  2. **Mensaje de rechazo de ingreso uniforme** (D14 pedía "un mensaje claro"):
     claro en qué hacer, no en por qué, para no permitir descubrir qué emails
     existen (FR-003).
  3. **Acceso inicial entregado al administrador** en la respuesta del alta
     (no por correo, Fase C); el administrador conoce el enlace durante la
     entrega — canal de confianza asumido, con vencimiento y un solo uso.
  4. Último administrador protegido; cambio de contraseña cierra las demás
     sesiones; la contraseña del primer acceso no se invalida al ingresar luego
     por otro método; provincia obligatoria solo para usuario normal.
- **Dependencias/consecuencias que el spec deja registradas y NO resuelve**:
  las pruebas de `backend/` y las E2E de `frontend/` crean usuarios por el alta
  pública por contraseña que dejará de existir; el perfil de `005` dejará de
  poder cambiar la provincia hasta la Fase B.
- **Acotación de US7**: se corrige cómo se **identifica** la pregunta; que el
  texto sea un enunciado legible depende de D19 (un dato por cargar), que queda
  fuera.
- Todos los ítems pasan en la primera iteración.
