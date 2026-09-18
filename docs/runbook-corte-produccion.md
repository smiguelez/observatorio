# Runbook de corte a producción — Observatorio de Oficinas Judiciales

> **Estado:** documento vivo, iniciado el 2026-09-18 a partir de la
> experiencia de la migración de prueba Firestore→PostgreSQL (feature
> `001-modelo-datos-relacional`). Se sigue alimentando durante el resto de
> esta migración (US4, US5, polish) y durante el desarrollo de la nueva app
> (backend, frontend), si algo de ese desarrollo cambia el modelo de datos
> o el proceso de corte.
>
> **Esto no es la migración de prueba.** Es el proceso que se ejecuta **una
> sola vez**, cuando la nueva app esté probada y lista, para reemplazar la
> app vieja en producción. La migración de prueba (este mismo código, corrido
> contra un snapshot del 2026-09-16/18) sirvió para construir y validar este
> proceso — no es el corte en sí.

---

## Principio rector

Ninguna anomalía de datos se resuelve automáticamente sin confirmación
humana, aunque ya se haya visto un caso igual antes. El código **detecta y
detiene**; una persona **decide y confirma**. Esto es deliberado: las tres
anomalías que aparecieron en la migración de prueba (ver abajo) se resolvieron
con conocimiento de dominio específico de ese caso puntual — automatizar la
misma resolución para un caso nuevo y distinto sería repetir el error que el
Principio VII de la constitution existe para evitar (no asumir sobre datos no
verificados).

---

## Pasos del corte real

1. **Congelar el origen.** Poner Firestore en modo solo lectura (Principio
   IX) *antes* de exportar — no después. Ningún alta o edición debe poder
   ocurrir entre el export y el encendido de la app nueva.
2. **Export fresco.** Nunca reusar un snapshot de una corrida de prueba
   anterior — el corte real exporta el estado real al momento del corte, no
   un estado de hace semanas.
3. **Ambiente Postgres reproducible por script**, no por comandos tipeados a
   mano en una sesión de terminal. Debe incluir, desde el vamos: creación de
   rol, base, extensión `citext`, y **ownership correcto de tablas/vistas/
   secuencias/tipos asignado a ese rol en el mismo script que las crea** — en
   la migración de prueba esto se corrigió a mano después de un error; en el
   corte real no debería hacer falta corregir nada.
4. **Detección de anomalías conocidas** (ver tabla abajo) — el pipeline debe
   señalar cada caso que matchee un patrón ya visto, y **detenerse** a
   esperar confirmación humana antes de aplicar la resolución, aun cuando la
   resolución ya esté documentada de una vez anterior.
5. **Detección de anomalías nuevas** — cualquier caso que no matchee ningún
   patrón conocido debe frenar la carga de ese registro puntual (no de todo
   el pipeline) y quedar listado para revisión manual antes de reintentarlo.
6. **Reconciliación como gate real, no como reporte posterior.** Si algún
   conteo origen/destino no coincide, la app nueva **no se enciende** — el
   corte se aborta y se investiga, tal como ya hace `reconcile.js`
   (`DiscrepanciaAbiertaError`, FR-032). Esto ya está bien diseñado; el
   runbook solo lo explicita como criterio de ir/no ir del corte, no solo
   como comportamiento del script.
7. **Encender la app nueva recién con reconciliación 100% en verde.**

---

## Anomalías conocidas (detectar y frenar para confirmación — no auto-resolver)

| Patrón | Visto en migración de prueba | Regla de detección |
|---|---|---|
| Localidad sin `latitud`/`longitud` | 1 caso (CABA, D-15) | Cualquier localidad con alguno de los dos campos nulo → frenar, mostrar el documento, pedir coordenada de referencia pública y su fuente antes de cargar. |
| `jueces_asistidos` como string `"0"` explícito | 9 casos (D-16) | Cualquier UF con ese valor exacto → frenar y listar para confirmar si es "administrativa sin jueces por diseño" (D6) o "jueces pendientes de asignar" (dato incompleto, no estructural) — son dos resoluciones distintas, no la misma. |
| Código de taxonomía fuera del catálogo válido | 1 caso ("F", D-17) | Cualquier código no presente en `taxonomia_codigos` → frenar, mostrar el organismo y el código recibido, pedir confirmación del código correcto — no asumir el mapeo usado la vez anterior. |

---

## Requerimientos a definir con el proveedor de infraestructura

*(pendiente — placeholder para cuando se llegue a la etapa de pruebas de la
nueva app; no bloquea nada de la migración de datos)*

---

## Historial

- **2026-09-18:** documento creado a partir de la migración de prueba de la
  feature `001-modelo-datos-relacional` (US1-US3 completos, D-15/D-16/D-17
  resueltas por Santi durante la corrida).
