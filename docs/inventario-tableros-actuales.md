# Inventario de tableros actuales (Looker Studio)

> Documento vivo. Registra qué existe **hoy** en Looker Studio/DataStudio
> (la "D2" de `docs/decisiones-pendientes.md`, nunca resuelta hasta ahora:
> qué reemplaza a Looker Studio era un punto ciego porque nadie había
> inventariado qué hay que reemplazar). Es solo inventario — **no resuelve
> nada todavía**: ni qué migra a Metabase, ni en qué orden, ni cómo se
> arma cada visualización ahí. Eso es trabajo de la propia Fase D
> (`docs/plan-camino-a-produccion.md`) cuando se retome en serio.
>
> Fuente: capturas de los 4 dashboards compartidas por Santi (2026-09-30).
> Las descripciones son de lo que se ve en pantalla, no una lectura del
> `.json`/config de Looker Studio ni un mapeo contra el esquema de
> PostgreSQL — ese mapeo (qué consulta exacta arma cada visualización) es
> parte de resolver D2, no de este inventario.

---

## 1. "Datos Generales del Observatorio"

Vista panorámica / landing del conjunto de dashboards.

**KPIs (tarjetas numéricas):**
- Cantidad de provincias
- Cantidad de localidades
- Cantidad de usuarios
- Cantidad de organismos
- Cantidad de unidades funcionales (UF)
- Cantidad de jueces asistidos

**Visualizaciones:**
- Organismos por tipo (de oficina)
- Organismos por fuero simplificado
- Mapa coroplético (provincias coloreadas) — sin precisar todavía qué
  métrica colorea el mapa (cantidad de organismos, de UF, u otra)

---

## 2. "Unidades Funcionales"

**Tabla filtrable**, con filtros por:
- Provincia
- Fuero
- Denominación simplificada
- Tipo de oficina

**Mapa de puntos** geolocalizados por UF (un punto por unidad funcional,
no agregado por provincia como el de la pantalla 1).

---

## 3. "Asistencia a Magistrados"

**Visualizaciones:**
- Mapa de círculos por provincia — el tamaño del círculo representa la
  cantidad de jueces asistidos en esa provincia
- Ranking de provincias (por jueces asistidos, a confirmar el orden
  exacto)
- KPI: total de jueces asistidos
- Gráfico de torta por fuero
- Tabla de organismos con más jueces (un ranking/top, no el listado
  completo)

---

## 4. "Dimensión Organización"

**Visualización principal:** barras apiladas por categoría de jerarquía
("Tribunal Superior", "Coordinación", "Jueces", "Otro", "sin datos"),
cruzadas por fuero.

- **Nota del propio dashboard**: esta clasificación de jerarquía solo
  aplica a organismos de tipo "oficina judicial"/"oficina judicial
  especializada" — para los demás tipos no corresponde o no está cargada
  ("sin datos" es una categoría explícita, no un vacío).
- De dónde sale exactamente esa categoría de 5 valores (si es un campo
  propio de la carga original, una columna de Firestore, o una
  derivación) **no está confirmado todavía** — es parte de lo que hay que
  mirar al resolver D2, no algo que este inventario pueda afirmar sin
  verificarlo contra la fuente real.

**Además:**
- Tabla filtrable de organismos
- Tabla filtrable de unidades funcionales

---

## Lo que este inventario NO responde todavía

- Qué tablero(s) de los 4 son prioritarios para migrar primero.
- Si "Dimensión Organización" depende de un dato que en el modelo nuevo
  (PostgreSQL, `003-taxonomia-parametrizable`) ya existe, existe distinto,
  o no se migró — en particular, de dónde sale la categoría de jerarquía
  de 5 valores.
- Qué consulta exacta arma cada visualización (agregación, granularidad,
  filtros por defecto) — este documento describe lo que se VE, no lo que
  Looker Studio consulta por debajo.
- Si hay algún otro tablero o vista que no esté entre estos 4 (este
  inventario cubre los 4 compartidos el 2026-09-30, no necesariamente la
  totalidad de lo que existe en la cuenta de Looker Studio).
