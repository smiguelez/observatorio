# Feature Specification: Envío de email para acceso

**Feature Branch**: `009-envio-email-autenticacion`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Especificá la Fase C del plan hacia producción: infraestructura de envío de email real, reemplazando el comportamiento actual donde el magic link solo se loguea en consola (G4, 002-backend-api-carga-datos). Proveedor: Resend... Alcance: 1. El envío de magic link... 2. El enlace de acceso inicial (007/008)... Configuración: API key de Resend por variable de entorno... Manejo de fallos: si el envío de email falla..., el admin tiene que enterarse... Fuera de alcance: cualquier otro tipo de notificación."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingresar por enlace recibido en la casilla real (Priority: P1)

Una persona con cuenta ya creada pide ingresar "por enlace" (magic link) desde
la pantalla de login. Hoy ese enlace se genera correctamente pero solo queda
anotado en un registro interno del servidor — nadie fuera del equipo técnico
puede verlo. Con esta historia, el enlace le llega de verdad a su casilla de
email, y puede ingresar sin depender de que alguien con acceso al servidor se
lo pase.

**Why this priority**: es el gap de producción ya señalado (G4): el
mecanismo de magic link está completo de punta a punta salvo por este único
paso, y bloquea que cualquier persona fuera del equipo técnico pueda usar
ese método de login hoy.

**Independent Test**: pedir "ingresar por enlace" con un email real de
prueba desde la pantalla de login, sin mirar ningún registro del servidor, y
confirmar que el correo llega a la casilla con un enlace que efectivamente
inicia sesión.

**Acceptance Scenarios**:

1. **Given** una persona con cuenta existente en la pantalla de login,
   **When** pide ingresar por enlace con su email, **Then** recibe en su
   casilla real, en los minutos siguientes, un correo con un enlace de
   acceso único y de un solo uso.
2. **Given** el enlace recibido, **When** la persona lo abre, **Then**
   inicia sesión igual que hoy (sin cambios en la seguridad ya construida:
   un solo uso, vencimiento corto, mismo mensaje de pantalla independiente
   de si la cuenta existe o no).
3. **Given** que el envío del correo no pudo completarse por un problema del
   lado del proveedor de envío, **When** la persona pide el enlace,
   **Then** ve exactamente el mismo mensaje que vería si el envío hubiera
   sido exitoso (no se le revela el fallo, para no abrir una vía de
   enumeración de cuentas), y el fallo queda registrado aparte para que un
   administrador lo note.

---

### User Story 2 - Entregar el acceso inicial por email, sin perder la opción manual (Priority: P2)

Un administrador da de alta a una persona nueva (o le reemite su acceso
porque lo perdió). Hoy la única forma de entregarle el acceso es copiar el
enlace a mano y pasárselo por otro medio. Con esta historia, el
administrador puede además pedirle al sistema que se lo envíe directamente
por email a la persona nueva, sin que eso reemplace la opción de copiarlo:
sigue pudiendo compartirlo a mano si el email todavía no es confiable, o si
la persona no tiene acceso inmediato a su casilla.

**Why this priority**: es una mejora de conveniencia sobre un flujo que ya
funciona hoy de punta a punta a mano (007/008) — no bloquea nada, a
diferencia de la Historia 1.

**Independent Test**: dar de alta un usuario nuevo con un email real de
prueba, elegir la opción de enviarlo por email en lugar de copiarlo, y
confirmar que el correo llega con el enlace correcto y que la opción de
copiar sigue disponible en la misma pantalla, antes y después de haberlo
enviado.

**Acceptance Scenarios**:

1. **Given** un administrador que acaba de dar de alta a un usuario o que
   está por reemitirle el acceso, **When** ve la pantalla con el acceso
   recién generado, **Then** ve tanto la opción de copiarlo a mano como la
   opción de enviarlo por email a esa misma persona, una junto a la otra.
2. **Given** el administrador elige enviarlo por email, **When** el envío
   se completa con éxito, **Then** ve una confirmación explícita de que el
   correo fue enviado — distinta de la confirmación de que el enlace fue
   generado, que ya existe hoy.
3. **Given** el administrador elige enviarlo por email y el envío falla
   (proveedor caído, dirección mal escrita, dominio remitente mal
   configurado, etc.), **When** eso ocurre, **Then** ve un aviso explícito
   del fallo en esa misma pantalla, sin perder el enlace ya generado, y
   puede recurrir de inmediato a copiarlo a mano sin tener que reemitir el
   acceso de nuevo.
4. **Given** un administrador reemitiendo el acceso de un usuario que ya
   existía (no un alta nueva), **When** elige enviarlo por email, **Then**
   el comportamiento es el mismo que en el alta: mismas dos opciones, mismo
   manejo del fallo.

---

### Edge Cases

- ¿Qué pasa si el usuario nuevo ya quedó creado en la base pero el envío del
  email de acceso inicial falla? El alta del usuario y el envío del email
  son dos pasos separados — el alta ya construida en 007/008 no se
  deshace por un fallo de envío; el administrador conserva el enlace ya
  generado y puede reemitir o copiar.
- ¿Qué pasa si la dirección de destino no existe o rebota (bounce) después
  de que el sistema ya informó el envío como exitoso? Queda fuera del
  control del sistema en el momento del pedido (ver Assumptions).
- ¿Qué pasa si el proveedor de envío tarda mucho en responder? El
  administrador o la persona que pide el login no deben quedar esperando
  indefinidamente — necesita un límite de espera razonable antes de tratar
  el envío como fallido.
- ¿Qué pasa si un administrador reemite el acceso de la misma persona varias
  veces seguidas? Ya está cubierto por el comportamiento existente (cada
  reemisión invalida la anterior, FR-019 de 007) — esta feature no cambia
  esa regla, solo agrega una forma más de entregar el enlace vigente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST enviar el magic link por email real a la
  casilla de la persona que lo pidió, en lugar de dejarlo solo registrado
  internamente.
- **FR-002**: El cambio a envío real MUST preservar las propiedades de
  seguridad ya construidas del magic link: un solo uso, vencimiento
  corto (del orden de minutos), y el mismo mensaje de pantalla sin importar
  si la cuenta existe o no.
- **FR-003**: Cuando el envío de un magic link no puede completarse, el
  sistema MUST mostrarle a quien lo pidió el mismo mensaje que si hubiera
  sido exitoso (no debe revelar el fallo en esa pantalla), y MUST dejar
  registro del fallo en un lugar donde un administrador pueda encontrarlo
  por separado.
- **FR-004**: Al dar de alta un usuario nuevo o al reemitir el acceso
  inicial de uno existente, el sistema MUST ofrecerle al administrador la
  opción de enviar el enlace de acceso directamente por email a esa
  persona.
- **FR-005**: La opción de enviarlo por email MUST NOT reemplazar la
  opción manual de copiar el enlace — ambas MUST estar disponibles al
  mismo tiempo, en alta y en reemisión.
- **FR-006**: El sistema MUST informarle al administrador, en la misma
  pantalla y de forma explícita, si el email de acceso inicial fue enviado
  con éxito o si el envío falló — distinguiendo eso de la confirmación de
  que el enlace fue generado (que ya existe hoy).
- **FR-007**: Si el envío del email de acceso inicial falla, el sistema
  MUST permitirle al administrador recurrir de inmediato a la opción
  manual de copiar el mismo enlace ya generado, sin invalidarlo y sin
  obligarlo a reemitir el acceso de nuevo.
- **FR-008**: El sistema MUST NOT incluir el token de acceso ni ninguna
  contraseña en ningún registro relacionado con el envío del email, tanto
  en el caso de éxito como en el de fallo (misma regla ya vigente para el
  flujo manual, ver Assumptions).
- **FR-009**: El sistema MUST quedar limitado, en esta feature, a estos dos
  usos (magic link, acceso inicial) — ningún otro tipo de aviso o
  notificación del sistema se envía por este medio.

### Key Entities

- **Intento de envío de email**: representa un pedido de entrega de un
  enlace (magic link o acceso inicial) a una dirección de destino, con su
  propósito, el resultado (enviado o fallido) y el momento en que ocurrió.
  No incluye el contenido sensible del enlace (token) — solo lo necesario
  para que un administrador pueda advertir y seguir un fallo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los logins por enlace y de las altas/reemisiones
  de acceso que terminan en un envío exitoso se completan sin que ninguna
  persona (usuario ni administrador) necesite consultar ningún registro
  interno del servidor — alcanza con revisar la pantalla y la casilla de
  email.
- **SC-002**: Cuando el envío de un acceso inicial falla, el administrador
  se entera del fallo en la misma pantalla en la que lo pidió, en el
  momento, sin necesitar abrir ningún otro sistema.
- **SC-003**: Dar de alta un usuario nuevo y entregarle el acceso (por
  email o a mano) sigue tomando menos de un minuto, igual que hoy con el
  flujo manual.
- **SC-004**: El envío de email para el volumen esperado (decenas de
  usuarios activos, altas esporádicas) no genera costos de
  infraestructura.

## Assumptions

- El proveedor de envío ya fue decidido de antemano por el usuario
  (Resend, capa gratuita) — no es una decisión a re-evaluar en esta spec,
  sino un dato de entrada para la fase de planificación.
- La dirección/dominio remitente concreto (dominio propio verificado vs.
  el dominio de prueba del proveedor) es una decisión técnica a resolver
  en la fase de planificación, investigando contra la documentación del
  proveedor y el volumen real esperado — no cambia ninguno de los
  requisitos funcionales de esta spec.
- La credencial de envío (API key) se carga como secreto fuera del árbol
  del repositorio, igual que el resto de las credenciales del proyecto
  (constitution, Principio XIII) — no se decide en esta spec el mecanismo
  concreto, ya establecido para otras credenciales.
- La regla de no registrar tokens ni contraseñas en logs ya está probada
  para el flujo manual de acceso inicial (007) y se extiende sin
  excepción al nuevo camino de envío por email.
- Un rebote (bounce) posterior al envío exitoso — la dirección no existe o
  rechaza el correo después de que el proveedor lo aceptó — queda fuera
  del alcance de esta feature: el sistema informa el resultado que le da
  el proveedor en el momento del envío, no un seguimiento de entrega
  posterior.
- El límite de intentos de login (rate limiting, D10) es una decisión
  aparte, ya identificada en el plan hacia producción, y no se resuelve
  como parte de esta feature.
