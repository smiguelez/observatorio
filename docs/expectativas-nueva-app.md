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
> este backlog.
>
> **Cuándo se procesan:** después de que backend, frontend y reporting
> queden traducidos y en producción reemplazando a la app vieja — recién ahí
> cada ítem de acá se convierte en su propia feature-spec.

---

## Ítems

1. **Aviso al usuario cuando se revoca su contraseña por verificación
   cruzada de email.** Better Auth revoca automáticamente la credencial de
   contraseña de un usuario cuando verifica su email por otro método (magic
   link) mientras la contraseña aún no estaba verificada
   (`revokeUnprovenAccountAccess`) — comportamiento correcto y deseado
   contra apropiación de cuenta (ver `research.md` de
   `002-backend-api-carga-datos`, hallazgo de la verificación de US1). Para
   el caso de un usuario legítimo que simplemente probó los dos métodos
   propios, esto revoca su contraseña sin aviso. No cambia el modelo de
   datos ni ningún principio — es una mejora de experiencia (ej. un email
   explicando qué pasó y cómo poner una contraseña nueva), a resolver en la
   feature de frontend.

2. **Rol nuevo: supervisor_provincial.** Requiere una regla de autorización
   nueva en el backend (`002-backend-api-carga-datos`), análoga a
   `esAdmin()` — no es solo una pantalla nueva.

3. **Ampliar taxonomía a tipos de organismo sin taxonomía hoy** (coordinaciones,
   unidades operativas). Depende de definir primero las preguntas concretas
   de cada tipo nuevo — no especificable todavía, a diferencia de la
   reformulación de la taxonomía existente (que sí se resolvió como parte
   del modelo de datos, ver `decisiones-pendientes.md`).

4. **Log de auditoría de altas/bajas/modificaciones**, revisable por admin,
   con notificación. Requiere una tabla nueva que no existe hoy.

5. **Campos nuevos de plantilla/personal**: cantidad de empleados y
   funcionarios (por plantilla y actuales), cantidad que asiste
   directamente a jueces, régimen previsional, indicadores — todos requieren
   columnas o tablas nuevas en el modelo ya migrado.

6. **Administración de taxonomía desde la UI** (que un admin cree/edite
   preguntas y sus opciones sin tocar la base a mano). Surgió al ver el
   esquema flexible de preguntas-como-datos — tiene sentido, pero requiere
   resolver antes sus propias reglas de integridad (¿se puede borrar una
   pregunta con respuestas ya cargadas? ¿cambiar su tipo invalida las
   respuestas existentes?) y su propia superficie de autorización. No entra
   junto con la reformulación de esquema de taxonomía — es una feature
   aparte.

7. **Perfil de usuario, menú de ajustes, mejora de jerarquía de menús** por
   criterios de UX — pantallas nuevas sobre datos que ya existen, sin tocar
   modelo ni backend.

8. **Ampliar tipos de unidad funcional** (más allá de delegación/
   subdelegación/área específica) — liviano: `tipos_uf` ya es una tabla de
   catálogo con FK, agregar un tipo nuevo es una fila, no un cambio de
   esquema.

9. **Link a normativa de creación** (por organismo y opcionalmente por UF,
   URL + opción de parsear a texto + tipo de documento). Suficientemente
   grande como para ser su propia feature-spec cuando se aborde, no un ítem
   de backlog suelto.

10. **Digesto — motor de IA que responda preguntas sobre la documentación
    de los organismos** (tipo bot). Misma observación que el ítem anterior:
    candidata a feature-spec propia, no a un ítem de backlog.
