# Expectativas para la nueva app — backlog post-migración

> **Qué es esto:** ideas, cambios y funcionalidades nuevas que Santi espera
> de la app reformulada, que **no** son parte de traducir fielmente la app
> actual a la arquitectura nueva. No tienen un original contra el cual
> validarse — por eso no entran en las features de traducción (modelo de
> datos, backend, frontend, reporting), sino que se acumulan acá hasta que
> la traducción esté completa.
>
> **Criterio de entrada a una feature de traducción, en vez de quedar acá:**
> únicamente si la expectativa obliga a cambiar el modelo de datos o un
> principio de la constitution — no por ser "chica" o "conveniente hacerla
> ya que estamos". Ejemplo ya resuelto así: D3 (fuero_simplificado como
> vista calculada) y D8 (modelo de asignación de jueces) entraron directo en
> la feature de modelo de datos porque tocaban el esquema; no pasaron por
> este backlog. El aviso de revocación de contraseña y el perfil/ajustes/
> menús UX (antes ítems de este backlog) se incorporaron directo a
> `005-frontend-cliente` por el mismo tipo de razonamiento: no tocaban
> modelo ni backend, y no había motivo real para esperar.
>
> **Cuándo se procesan:** después de que backend, frontend y reporting
> queden traducidos y en producción reemplazando a la app vieja — recién ahí
> cada ítem de acá se convierte en su propia feature-spec.

---

## Ítems

1. **Rol nuevo: supervisor_provincial.** Requiere una regla de autorización
   nueva en el backend (`002-backend-api-carga-datos`), análoga a
   `esAdmin()` — no es solo una pantalla nueva.

2. **Ampliar taxonomía a tipos de organismo sin taxonomía hoy** (coordinaciones,
   unidades operativas). Depende de definir primero las preguntas concretas
   de cada tipo nuevo — no especificable todavía, a diferencia de la
   reformulación de la taxonomía existente (que sí se resolvió como parte
   del modelo de datos, ver `decisiones-pendientes.md`).

3. **Log de auditoría de altas/bajas/modificaciones**, revisable por admin,
   con notificación. Requiere una tabla nueva que no existe hoy.

4. **Campos nuevos de plantilla/personal**: cantidad de empleados y
   funcionarios (por plantilla y actuales), cantidad que asiste
   directamente a jueces, régimen previsional, indicadores — todos requieren
   columnas o tablas nuevas en el modelo ya migrado.

5. **Administración de taxonomía desde la UI** (que un admin cree/edite
   preguntas y sus opciones sin tocar la base a mano). Surgió al ver el
   esquema flexible de preguntas-como-datos — tiene sentido, pero requiere
   resolver antes sus propias reglas de integridad (¿se puede borrar una
   pregunta con respuestas ya cargadas? ¿cambiar su tipo invalida las
   respuestas existentes?) y su propia superficie de autorización. No entra
   junto con la reformulación de esquema de taxonomía — es una feature
   aparte.

6. **Ampliar tipos de unidad funcional** (más allá de delegación/
   subdelegación/área específica) — liviano: `tipos_uf` ya es una tabla de
   catálogo con FK, agregar un tipo nuevo es una fila, no un cambio de
   esquema.

7. **Link a normativa de creación** (por organismo y opcionalmente por UF,
   URL + opción de parsear a texto + tipo de documento). Suficientemente
   grande como para ser su propia feature-spec cuando se aborde, no un ítem
   de backlog suelto.

8. **Digesto — motor de IA que responda preguntas sobre la documentación
   de los organismos** (tipo bot). Misma observación que el ítem anterior:
   candidata a feature-spec propia, no a un ítem de backlog.
