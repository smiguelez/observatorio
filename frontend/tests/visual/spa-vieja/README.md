# SPA vieja para comparación visual (SC-007)

`run.sh` levanta el **código de `src/` de la raíz, sin modificar**, en `http://localhost:5180`, con Firebase
(auth y Firestore) reemplazado por stubs en memoria con **datos sintéticos** (`firebase-*.js`). Trabaja en un
directorio temporal (`/tmp/spa-vieja` por defecto, ~500 MB por sus `node_modules`): no toca el repositorio.

```bash
bash frontend/tests/visual/spa-vieja/run.sh            # SPA vieja en :5180
# con el backend y `npm run dev` de la app nueva corriendo:
VIEJA_URL=http://localhost:5180 VISUAL_DIR=../docs/evidencia-frontend \
  npx playwright test comparacion-visual                 # desde frontend/
```

La SPA vieja redirige a `/` en cada carga de página: la prueba navega solo con clics. Sin `VIEJA_URL` la
prueba se omite. Las capturas resultantes (`docs/evidencia-frontend/comparacion-*.png`) y las métricas
(`comparacion-visual-metricas.json`) solo contienen datos sintéticos.
