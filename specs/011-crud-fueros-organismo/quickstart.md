# Quickstart: validar la edición de fueros de un organismo

Guía de validación, no de implementación. Contrato: `contracts/api.md`;
modelo: `data-model.md`; decisiones y evidencia: `research.md`.

## Prerrequisitos

- Backend de `011` corriendo con la base real (`DATABASE_URL`) — no hace
  falta ninguna credencial nueva, esta feature no toca configuración.
- Un organismo de prueba propio (o de un admin) para editar.

## Escenarios

| # | Escenario | Cómo | Resultado esperado | Historia / criterio |
|---|---|---|---|---|
| 1 | Un solo fuero | `PUT .../fuero` con `{ fueroIds: [idCivil] }` sobre un organismo sin fueros | `200`, `fueroSimplificado: "Civil"`; `estado_fueros` pasa a `cargado` | US1, Acceptance Scenario 1 |
| 2 | Multifuero | Agregar un segundo fuero al mismo organismo | `200`, `fueroSimplificado: "multifuero"` | US1, Acceptance Scenario 2 |
| 3 | Vaciar el listado | `PUT` con `{ fueroIds: [] }` | `200`, sin fuero asignado; `estado_fueros` pasa a `sin_fueros_asignados` | US1, Acceptance Scenario 3 |
| 4 | Sin autorización | Un usuario sin relación con el organismo intenta `GET`/`PUT` | `403`, igual que hoy para cualquier otro dato del organismo | US1, Acceptance Scenario 4 / FR-006 |
| 5 | Completar un `multifuero_sin_detalle` real | Sobre uno de los 20 organismos en ese estado, `PUT` con el listado real | `200`, `estado_fueros` pasa a `cargado`, `fueroSimplificado` refleja el listado exacto | US1, Acceptance Scenario 5 |
| 6 | Fuero en uso, bloqueado | Con una unidad funcional que tiene una asignación de jueces acotada a un fuero, `PUT` sin ese fuero | `400`, mensaje + `fuerosEnUso`; el listado y `estado_fueros` quedan sin cambios | US2, Acceptance Scenario 1 |
| 7 | Liberado tras quitar la asignación | Quitar/ampliar la asignación de jueces primero, reintentar el `PUT` sin ese fuero | `200`, se aplica sin bloqueo | US2, Acceptance Scenario 2 |
| 8 | Id de fuero inexistente | `PUT` con un `fueroId` que no está en el catálogo | `400`, nada se escribe | contracts/api.md |
| 9 | Detector de relleno inicial | Correr `scripts/detectar-fueros-sin-poblar.ts` (dry-run) | Reporta 0 organismos `cargado` con 0 filas (verificado 2026-09-28) — no rellena nada porque no hay ningún caso | research.md, Decisión 3 |

## Comandos

```bash
cd backend
npm test   # contract + integration
```
