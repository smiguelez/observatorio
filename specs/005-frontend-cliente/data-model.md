# Data Model: modelo del lado del cliente

Feature `005-frontend-cliente`. No hay base de datos ni entidades nuevas: el
cliente no persiste nada (sin `localStorage` de datos ni de sesión). Este
documento define los **tipos de dominio del cliente** (lo que ven las
pantallas), sus reglas de validación y el estado de UI con ciclo de vida
propio. La forma "wire" de cada endpoint está en
`contracts/consumed-api.md`; la conversión wire → dominio la hace la capa de
mapeo de D13 (research.md, Decisión 4).

## Mecanismo de mapeo (D13)

Un esquema zod por recurso en `frontend/src/api/`, que en una pasada:

1. **valida** la forma de la respuesta (si no coincide → `ContratoInesperado`
   con recurso y campo);
2. **normaliza casing** a camelCase (`propietario_id` → `propietarioId`,
   `total_jueces` → `totalJueces`, `nombre_display` → `nombreDisplay`);
3. **convierte los ids de usuario `string → number`** con un helper único
   (`usuarioIdDesdeWire`), que exige `Number.isSafeInteger` y lanza si no.

Ninguna pantalla ni hook importa tipos "wire". En sentido inverso (cuerpos y
paths) los ids ya son `number`: no hay conversión dispersa.

| Campo wire | Dominio |
|---|---|
| `/api/auth/session` → `usuarioId: "12"` | `Sesion.usuarioId: 12` |
| `organismos.propietario_id: "12"` | `Organismo.propietarioId: 12` |
| editores `usuarioId: "12"` | `Editor.usuarioId: 12` |
| usuarios `id: "12"` | `Usuario.id: 12` |
| `POST /editores {usuarioId: number}` | se envía `Editor.usuarioId` tal cual |

## Tipos de dominio

```ts
type UsuarioId = number           // normalizado desde el string del wire
type Rol = 'usuario_normal' | 'admin'

interface Sesion { usuarioId: UsuarioId; rol: Rol; provinciaId: number | null }

interface Catalogo { id: number; nombre: string }   // provincias, tipos de oficina/UF, denominaciones, fueros

interface OrganismoResumen { id: number; denominacion: string; propietarioId: UsuarioId }
// Derivada en el cliente, no viene del backend:
type RelacionOrganismo = 'propietario' | 'editor' | 'admin'
//   propietario: propietarioId === sesion.usuarioId
//   admin:       sesion.rol === 'admin' y no es propietario
//   editor:      cualquier otro caso (la lista solo trae propios y editados)

interface Organismo extends OrganismoResumen {
  denominacionSimplificadaId: number; tipoOficinaId: number; provinciaId: number
  estadoFueros: string; actualizadoA: string | null
}
interface FueroOrganismo { fueros: Catalogo[]; fueroSimplificado: string | null }

interface UnidadFuncional {
  id: number; organismoId: number; denominacionUnidad: string
  localidadId: number; tipoUfId: number; anioImplementacion: number | null
  domicilio: string | null; telefono: string | null; mail: string | null
  responsable: string | null; codigoPostal: string | null
}

interface PoolJueces { id: number; descripcion: string | null; totalJueces: number; provinciaId: number }
interface AsignacionJueces { id: number; grupoJuecesId: number; cantidadAsignada: number }

interface Editor { usuarioId: UsuarioId; nombre: string | null; email: string }
interface Usuario { id: UsuarioId; email: string; nombreDisplay: string | null; provinciaId: number | null; roles: string[] }  // roles: null del wire → []

type TipoRespuesta = 'opcion_unica' | 'opcion_multiple' | 'numerica' | 'texto_libre'
interface Opcion { codigo: string; etiqueta: string }
interface PreguntaTaxonomia { codigo: string; texto: string; grupo: string; tipoRespuesta: TipoRespuesta; opciones?: Opcion[] }
type RespuestaForm =
  | { tipo: 'opcion_unica';    opcionCodigo: string | null }
  | { tipo: 'opcion_multiple'; opcionesCodigos: string[] }
  | { tipo: 'numerica';        valorNumero: number | null }
  | { tipo: 'texto_libre';     valorTexto: string }
```

Lo que **no** existe en el modelo, a propósito: un "modo" de asignación de
jueces (exclusivo / pool completo / subconjunto) — la base solo guarda
`(UF, pool, cantidad)` (D8); ni fuero por asignación (no expuesto por `006`);
ni ninguna entidad de "solicitud de acceso" o "invitación" (backlog ítem 9).

## Reglas de validación (del cliente, además de las del servidor)

El servidor es la barrera real (Principio II); estas reglas son UX. Todo `400`
del servidor se muestra aunque el cliente no lo haya anticipado.

| Formulario | Regla |
|---|---|
| Login por contraseña | email con formato válido, contraseña no vacía. **Cualquier** error del servidor → un único mensaje genérico (FR-002); nunca se distingue la causa |
| Organismo — alta | `denominacion` no vacía; denominación simplificada y tipo obligatorios; **provincia**: `usuario_normal` → fija = `sesion.provinciaId` (alta bloqueada con explicación si es `null`); `admin` → `select` editable |
| Organismo — edición | los mismos campos; `provinciaId` editable solo para admin. Si cambiar `tipoOficinaId` recibe `400` con `preguntasQueSePerderian`, se lista y se ofrece reenviar con `confirmarPerdidaTaxonomia: true` (nunca se envía `true` de entrada) |
| UF | `denominacionUnidad` no vacía; `localidadId` (filtrada por la provincia del organismo) y `tipoUfId` obligatorios; `anioImplementacion` entero opcional de 4 dígitos; `mail` con formato de email si se completa. En edición no se ofrece "vaciar" un opcional ya cargado (el `PATCH` no lo permite) |
| Asignación de jueces | pool obligatorio y no repetido dentro de la UF; `cantidadAsignada` entero > 0; `cantidadAsignada > totalJueces` **advierte, no bloquea** (D8) |
| Pool (dentro del diálogo) | `totalJueces` entero ≥ 0; provincia: admin → la del organismo, no admin → la propia. Borrado: se confirma; un `500` se muestra como "no se pudo eliminar, puede estar asignado a otras UF" (G6) |
| Taxonomía | esquema zod construido en runtime desde el catálogo: única → ≤ 1 opción del catálogo; múltiple → 0..n (0 = no responder, no es error); numérica → número finito; texto libre → string (vacío = no responder) |
| Perfil | `nombreDisplay` string; `provinciaId` del catálogo; `fotoUrl` URL opcional |
| Cambio de contraseña | solo si hay cuenta `credential`; actual obligatoria; nueva ≥ mínimo de Better Auth (8 por defecto); confirmación coincidente |
| Editores | el candidato sale de `GET /api/usuarios`, excluyendo al propietario y a los editores actuales |

## Construcción del formulario de taxonomía (flujo de datos)

```
GET /api/organismos/:orgId                     → tipoOficinaId
GET /api/taxonomia/preguntas?tipoOficinaId=…   → catálogo aplicable (TODAS las opciones)
GET /api/organismos/:orgId/taxonomia           → respuestas existentes (opciones = solo las elegidas)
        ↓ merge por pregunta.codigo
Una fila por pregunta del catálogo, control según tipoRespuesta, precargada.
Guardar → PUT con TODAS las respuestas no vacías (omitir = borrar)
```

Catálogo `[]` (coordinación, unidad operativa) ⇒ estado explícito "este tipo
de organismo no tiene taxonomía" (FR-023); no se renderiza formulario ni se
pide `GET …/taxonomia`.

## Completitud de un organismo (US7, FR-017)

Derivada en el cliente, sin modelo persistido:

| Criterio | Cumple si |
|---|---|
| Datos básicos | `denominacion`, `tipoOficinaId`, `provinciaId` y `denominacionSimplificadaId` no nulos |
| Unidades funcionales | `GET …/unidades-funcionales` devuelve ≥ 1 |
| Taxonomía | el catálogo aplicable a su `tipoOficinaId` es `[]` (**completa, nada pendiente** — decisión 7) **o** `GET …/taxonomia` devuelve ≥ 1 respuesta |

Optimización derivada del criterio: el catálogo se pide una sola vez por
`tipoOficinaId` y se cachea; los tipos con catálogo vacío no piden respuestas.

## Estado de UI con ciclo de vida propio

| Estado | Dónde vive | Notas |
|---|---|---|
| Sesión (`Sesion \| null`) | TanStack Query, `['sesion']` | `401` ⇒ `null` ⇒ redirección a `/login`; se invalida en login/logout |
| Datos del servidor | TanStack Query, clave por recurso | invalidación tras cada mutación; catálogos con `staleTime: Infinity` |
| Borrador de formulario | react-hook-form (memoria) | ante `401` al guardar se conserva en memoria mientras se avisa y se re-loguea sin recargar; si el login es por redirección externa (Google) se pierde — límite aceptado ("si es evitable", Edge Case de la spec) |
| Preferencias de UI (tema, sidebar) | `localStorage` en try/catch | único uso de storage; nunca datos ni tokens |
| Progreso de completitud (admin) | estado local de la pantalla | cola de concurrencia 6 |
| Estado del diálogo de asignación | local al diálogo | pestaña activa (asignar / pools), UF abierta |
