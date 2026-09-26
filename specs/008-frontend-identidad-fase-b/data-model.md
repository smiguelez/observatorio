# Data Model: modelo del lado del cliente (Fase B)

Feature `008-frontend-identidad-fase-b`. **No hay esquema de datos propio** (el cliente no persiste nada). Este documento fija los
tipos de dominio nuevos o modificados, cómo se mapean desde las respuestas reales de `007`
(`research.md` Decisión 1), las reglas de validación del cliente y los estados de UI con ciclo de vida propio. Se apoya en
`005/data-model.md` (mecanismo de mapeo D13, tipos existentes) y no lo repite.

## Mapeo de los recursos nuevos (mismo mecanismo que `005`)

Un esquema zod por recurso valida la respuesta y devuelve el tipo de dominio. Los endpoints nuevos ya vienen en camelCase, por lo que el mapeo
solo convierte ids y fechas:

| Recurso | Wire (real) | Dominio | Transformación |
|---|---|---|---|
| Alta administrada | `{ id: string, email, provinciaId: number\|null, roles: string[], accesoInicial: { token, vence } }` | `UsuarioAlta` | `id → number` (`idWire`); `vence → Date`; `roles` validados contra `Rol` |
| Acceso emitido (reemisión) | `{ token, vence }` | `AccesoInicial` | `vence → Date` |
| Canje | `{ usuarioId: string }` | `{ usuarioId: number }` | `usuarioIdDesdeWire` |
| Cambio de rol | `{ id: string, roles: string[] }` | `{ id: number, roles: Rol[] }` | `id → number` |
| Cambio de provincia | `PATCH` sin cambios: `{ id, email, nombre_display, provincia_id, foto_url }` | (existente) | esquema `PatchWire` de `005`, sin tocar |
| Error con pregunta | `{ error, preguntaCodigo?, preguntaTexto? }` (dentro de `ApiError.cuerpo`) | `ErrorTaxonomia` | `safeParse`; si falta o no es string ⇒ sin pregunta |

## Tipos de dominio nuevos

```
AltaUsuarioInput      { email: string; rol: Rol; provinciaId: number | null }   // provinciaId obligatoria si rol = usuario_normal
UsuarioAlta           { id: number; email: string; provinciaId: number | null; roles: Rol[]; accesoInicial: AccesoInicial }
AccesoInicial         { token: string; vence: Date }                             // solo en memoria; nunca persistido (FR-003)
CanjeInput            { token: string; password: string }
ErrorTaxonomia        { preguntaCodigo?: string; preguntaTexto?: string }
```

`Rol` y `Sesion` no cambian de forma. `Usuario` (lista) conserva `roles: string[]`; el editor de rol usa `roles.includes('admin')`.

## Reglas de validación del cliente (además de las del servidor, que decide)

| Campo | Regla | Mensaje (ejemplo) | FR |
|---|---|---|---|
| Email del alta | no vacío, formato de email | "Ingresá un email válido" | FR-001 |
| Rol del alta | `admin` o `usuario_normal` | — (control de opciones) | FR-001 |
| Provincia del alta | obligatoria si rol = usuario normal; opcional si admin | "La provincia es obligatoria para un usuario normal" | FR-001, US1-3 |
| Contraseña (canje) | 8 a 128 caracteres (`CONTRASENA_MIN`, `CONTRASENA_MAX`) | "Tiene que tener al menos 8 caracteres" | FR-009 |
| Confirmación (canje) | igual a la contraseña | "Las contraseñas no coinciden" | FR-009 |
| Acceso (canje) | presente en el fragmento; si falta ⇒ estado "acceso no válido" sin formulario | mensaje único | FR-011 |
| Provincia (editor) | una del catálogo; **sin** opción "sin provincia" | — | FR-022 |

Cualquier rechazo del servidor (`{error}`) se muestra tal cual, junto al campo o al diálogo, sin reinterpretarlo (`research.md` Decisiones 2, 9).

## Estados de UI con ciclo de vida propio

**Pantalla de canje (`/primer-acceso`)** — máquina de estados, todo en memoria:

```
 leyendo ──(hay #token)──▶ formulario ──(enviar, válido)──▶ enviando ──200──▶ éxito (invalidar sesión, ir a /organismos, replace)
    │                          │  ▲                              │
    │                          │  └──(400 PASSWORD_*)────────────┤  error de campo, se conserva el formulario
    │                          │                                 └──(400 sin code / cualquier otro rechazo de acceso)──▶ acceso no válido
    └──(sin token)──▶ acceso no válido (mensaje único, sin formulario)           └──(red / 5xx)──▶ error transitorio, reintentar (el token se conserva en memoria)
 (al entrar a `formulario` se ejecuta el reemplazo de historial que quita el fragmento; si ya hay sesión se muestra el aviso previo al envío)
```

- "Acceso no válido" es **un solo estado** para usado, vencido, reemplazado, inventado o ausente (FR-011); no se distingue ni por texto ni por estructura.
- El token nunca sale de este estado del componente; la contraseña se limpia al desmontar.

**Diálogo de alta (admin)**: `formulario → enviando → resultado → cerrado`. En `resultado` se guarda `{ enlace, vence }` en estado local;
`copiado` (booleano) decide si cerrar pide confirmación; al cerrar se descarta el estado y se hace `reset()` de la mutación
(`gcTime: 0`, `research.md` Decisión 4). La reemisión usa el mismo estado `resultado`.

**Editor de usuario (admin)**: dos secciones con estado independiente (`idle | enviando | error(mensaje)`); la fila mostrada sale siempre de la lista consultada
(sin estado optimista): tras cada éxito se invalida `CLAVE_USUARIOS` y `CLAVE_SESION`.

**Sesión**: se invalida al cambiar de pantalla y ante un `403` de una mutación (`research.md` Decisión 7); no cambia su forma.

## Lo que NO cambia

Tipos de organismo, UF, taxonomía, catálogos, editores, completitud (`005/data-model.md`). El formulario de taxonomía conserva su construcción a partir del
catálogo; solo cambia de dónde toma la pregunta a resaltar (`ErrorTaxonomia`).
