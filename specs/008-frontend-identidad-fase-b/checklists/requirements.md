# Specification Quality Checklist: Frontend — Fase B: consumir la identidad y autorización de 007

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — los requisitos y criterios describen comportamiento; las rutas de archivos aparecen solo en *Contexto* como evidencia verificada del estado actual (convención de `005`–`007`), no como requisito
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (0; los puntos ambiguos se resolvieron con defaults documentados en *Assumptions*: reemisión incluida, confirmación solo al quitar el rol admin, sesión existente se avisa y se reemplaza)
- [x] Requirements are testable and unambiguous (FR-001..FR-031)
- [x] Success criteria are measurable (SC-001..SC-010)
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined (7 historias)
- [x] Edge cases are identified (acceso en historial/almacenamiento, doble canje, enlace recortado, aviso cerrado sin copiar, cambio de rol/provincia con sesión abierta, autodescenso, provincia irrevocable, admin sin provincia)
- [x] Scope is clearly bounded (fuera de alcance: T030, correo real, cambios de backend, restablecimiento por correo, rate limiting)
- [x] Dependencies and assumptions identified (007 mergeado y backend congelado; contrato de `007/contracts/api.md`; migración de las pruebas E2E de `005`)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (alta, canje, rol/provincia, perfil/alta de organismo, recorrido, pool en uso, taxonomía)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Verificado contra el código de `frontend/` antes de escribir (Principio VII): perfil con provincia editable, aviso de "sin provincia" que remite al perfil, usuarios de solo lectura, detección de pool en uso por `500`/`23503` (hoy inerte), resaltado de taxonomía por búsqueda de texto (funciona por coincidencia con los «» nuevos), única ruta pública = `/login`, y `crearUsuarioConClave` (alta pública) roto por `007`.
- Diferencia con el pedido literal: el pedido cita el mensaje viejo como "elegí tu provincia"; el texto real del código es "primero tenés que completar tu provincia en tu perfil". La spec reemplaza el real.
- Ampliación mínima: **reemisión del acceso inicial** (FR-004) — el pedido solo menciona el alta; se incluyó por ser el único modo de recuperar un enlace perdido. Es fácil de quitar si no se quiere.
