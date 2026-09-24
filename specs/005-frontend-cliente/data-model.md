# Data Model: modelo del lado del cliente

Feature `005-frontend-cliente`. No hay base de datos ni entidades nuevas: el
cliente no persiste nada (sin `localStorage` de datos ni de sesión). Este
documento define los **tipos de dominio del cliente** (lo que ven las
pantallas), sus reglas de validación, y el estado de UI que sí tiene ciclo de
vida propio. La forma cruda de cada endpoint está en
`contracts/consumed-api.md`; cada tipo de acá es la versión normalizada
(camelCase, ids coherentes) que produce un mapper en `frontend/src/api/`.

## Tipos de dominio

```ts
type UsuarioId = string          // bigint serializado; number solo al armar bodies
type Rol = 'usuario_normal' | 'admin'

interface Sesion { usuarioId: UsuarioId; rol: Rol; provinciaId: number | null }

interface Catalogo { id: number; nombre: string }   // provincias, tipos oficina/UF, denominaciones, fueros

interface OrganismoResumen { id: number; denominacion: string; propietarioId: UsuarioId }
// Relación del usuario con un organismo — derivada, no viene del backend:
type RelacionOrganismo = 'propietario' | 'editor' | 'admin'   // propietario si propietarioId === sesion.usuarioId;
                                                              // admin si sesion.rol==='admin' y no es propietario;
                                                              // editor en cualquier otro caso (la lista solo trae propios/editados)

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
interface Usuario { id: UsuarioId; email: string; nombreDisplay: string | null; provinciaId: number | null; roles: string[] }

type TipoRespuesta = 'opcion_unica' | 'opcion_multiple' | 'numerica' | 'texto_libre'
interface Opcion { codigo: string; etiqueta: string }
interface PreguntaTaxonomia { codigo: string; texto: string; grupo: string; tipoRespuesta: TipoRespuesta; opciones?: Opcion[] }
// Valor de formulario por pregunta (una unión discriminada, un caso por tipoRespuesta):
type RespuestaForm =
  | { tipo: 'opcion_unica';    opcionCodigo: string | null }
  | { tipo: 'opcion_multiple'; opcionesCodigos: string[] }
  | { tipo: 'numerica';        valorNumero: number | null }
  | { tipo: 'texto_libre';     valorTexto: string }
```

## Reglas de validación (del cliente, además de las del servidor)

El servidor es la barrera real (Principio II); estas reglas son UX y evitan
viajes inútiles. Todo `400` del servidor se muestra igual aunque el cliente no
lo haya anticipado.

| Formulario | Regla |
|---|---|
| Organismo (alta/edición) | `denominacion` no vacía; los tres ids son obligatorios; en alta, `provinciaId` = `sesion.provinciaId` (solo lectura para `usuario_normal`; alta bloqueada si es `null`) |
| Edición de organismo: cambio de `tipoOficinaId` | si el backend responde `400` con `preguntasQueSePerderian`, se muestra el listado y se ofrece reenviar con `confirmarPerdidaTaxonomia: true` (nunca se envía `true` de entrada) |
| UF | `denominacionUnidad` no vacía; `localidadId` (filtrada por provincia del organismo) y `tipoUfId` obligatorios; `anioImplementacion` entero opcional (4 dígitos); `mail` con formato de email si se completa |
| Asignación de jueces | `cantidadAsignada` entero > 0; pool obligatorio; no repetir un pool ya asignado a esa UF (el servidor también lo rechaza); `cantidadAsignada > totalJueces` del pool **advierte** pero no bloquea (D8: no hay validación de tope en el modelo) |
| Pool | `totalJueces` entero ≥ 0; `provinciaId` = la del usuario salvo admin |
| Taxonomía | se construye un esquema zod en runtime desde el catálogo: única → 1 opción del catálogo (opcional); múltiple → 0..n opciones (0 = no responder, no es error); numérica → número finito; texto libre → string (vacío = no responder) |
| Perfil | `nombreDisplay` string; `provinciaId` del catálogo; `fotoUrl` URL opcional |
| Contraseña nueva | mínimo lo que exija Better Auth (por defecto 8); confirmación coincidente |

## Construcción del formulario de taxonomía (flujo de datos)

```
GET /api/organismos/:orgId            → tipoOficinaId
GET /api/taxonomia/preguntas?tipoOficinaId=…   → catálogo aplicable (incluye TODAS las opciones)
GET /api/organismos/:orgId/taxonomia  → respuestas existentes (opciones = solo las elegidas)
        ↓ merge por pregunta.codigo
Formulario: una fila por pregunta del catálogo, control según tipoRespuesta,
precargada con la respuesta si existe.
Guardar → PUT con TODAS las respuestas no vacías (omitir = borrar)
```

Catálogo vacío ⇒ estado explícito "sin taxonomía aplicable a este tipo de
organismo" (coordinación / unidad operativa); no se renderiza formulario.

## Estado de UI con ciclo de vida propio

| Estado | Dónde vive | Notas |
|---|---|---|
| Sesión (`Sesion \| null`) | TanStack Query, clave `['sesion']` | `401` ⇒ `null` ⇒ redirección a `/login`; se invalida en login/logout |
| Datos del servidor | TanStack Query, clave por recurso | invalidación tras cada mutación; catálogos con `staleTime: Infinity` |
| Borrador de formulario | react-hook-form (memoria) | ante `401` al guardar, se conserva en memoria mientras se muestra el aviso de sesión vencida y se re-loguea **sin recargar la página** (SPA); si el login es por redirección externa (Google) el borrador se pierde — límite aceptado ("si es evitable", Edge Case de la spec) |
| Preferencias de UI (tema, sidebar colapsado) | `localStorage`, envuelto en try/catch | único uso de storage; nunca datos ni tokens |
| Progreso de completitud (admin) | estado local de la pantalla | cola con concurrencia 6 sobre ~117 × 3 requests |

## Completitud de un organismo (US7)

Derivada en el cliente, sin modelo persistido (spec, Assumptions):

| Criterio | Cumple si |
|---|---|
| Datos básicos | el organismo tiene `denominacion`, `tipoOficinaId`, `provinciaId` y `denominacionSimplificadaId` no nulos |
| Unidades funcionales | `GET …/unidades-funcionales` devuelve ≥ 1 |
| Taxonomía | `GET …/taxonomia` devuelve ≥ 1 respuesta **o** el catálogo aplicable al tipo está vacío (para no marcar como "incompleto" un tipo que no admite taxonomía) |

Esa última salvedad es una decisión propia de este plan (la spec dice "al
menos una respuesta"); se marca para confirmación.
