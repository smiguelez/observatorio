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
