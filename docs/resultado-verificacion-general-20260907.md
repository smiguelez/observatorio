# Verificación de datos Firestore — corrida 2026-09-07T23:23:51.504Z


## 0. Verificaciones globales

V0.2 — Colecciones raíz encontradas: localidades, organismos, pools_jueces, users
  Colecciones NO esperadas por el código: (ninguna)
V0.1 — Total en users: 46
V0.1 — Total en organismos: 116
V0.1 — Total en localidades: 129
V0.1 — Total en pools_jueces: 30

## 1. Colección `users`

Total users: 46
V1.1 — ids que no matchean patrón de email: 0
V1.1 — ids con alguna mayúscula: 0
V1.2 — documentos donde email !== id: 0
V1.3 — documentos sin 'rol': 0
V1.4 — documentos sin 'provincia': 0
V1.5 — documentos con solo {email, rol, provincia}: 3 (resto: 43)
V1.6 — documentos donde 'rol' NO es array: 0
  V1.7 — valores distintos dentro de rol[]:
    "usuario_normal" (string): 46
    "admin" (string): 3
  V1.8 — valores distintos de provincia:
    "Jujuy" (string): 5
    "San Juan" (string): 5
    "Corrientes" (string): 3
    "Tucumán" (string): 3
    "Neuquén" (string): 3
    "Rio Negro" (string): 3
    "Entre Rios" (string): 3
    "Salta" (string): 3
    "Catamarca" (string): 2
    "Santa Fe" (string): 2
    "Córdoba" (string): 2
    "Formosa" (string): 2
    "Buenos Aires" (string): 2
    "Mendoza" (string): 1
    "Santiago del Estero" (string): 1
    "Chubut" (string): 1
    "Chaco" (string): 1
    "CABA" (string): 1
    "San Luis" (string): 1
    "La Pampa" (string): 1
    "Tierra del Fuego" (string): 1
V1.9 — usuarios con 'admin' en rol: 3

## 2. Relaciones desde `organismos` hacia `users` (V1.10 / V2.13)

Total organismos: 116
V2.1 — organismos con algún campo obligatorio vacío/ausente: 0
  V2.4 — valores distintos de denominacion_simplificada:
    "Oficina de Gestión Asociada" (string): 27
    "Oficina Judicial" (string): 27
    "Oficina de Gestión de Audiencias" (string): 14
    "Dirección o Coordinación General de Oficinas Judiciales" (string): 13
    "Oficina Judicial Especializada" (string): 11
    "Unidad de Servicios Procesales" (string): 9
    "Oficina de Juicio por Jurados" (string): 5
    "Mesa de Entradas Centralizada" (string): 5
    "Oficina de Tramitación Integral" (string): 4
    "Oficina de Medidas Alternativas y Conciliación" (string): 1
V2.6 — organismos sin 'editores': 0
V2.7 — organismos sin 'usuario_google': 0
V2.8 — organismos sin 'actualizado_a': 0, sin 'legacy_id': 8
  V2.9 — tipos de actualizado_a:
    {"_seconds":1785250156,"_nanoseconds":222000000} (Timestamp): 1
    {"_seconds":1787940853,"_nanoseconds":78000000} (Timestamp): 1
    {"_seconds":1783346677,"_nanoseconds":622000000} (Timestamp): 1
    {"_seconds":1786030706,"_nanoseconds":428000000} (Timestamp): 1
    {"_seconds":1786059729,"_nanoseconds":274000000} (Timestamp): 1
    {"_seconds":1786059767,"_nanoseconds":754000000} (Timestamp): 1
    {"_seconds":1786029396,"_nanoseconds":806000000} (Timestamp): 1
    "2025-07-04T18:13:52.115Z" (string): 1
    {"_seconds":1786407093,"_nanoseconds":899000000} (Timestamp): 1
    {"_seconds":1785502693,"_nanoseconds":146000000} (Timestamp): 1
    {"_seconds":1759263296,"_nanoseconds":93000000} (Timestamp): 1
    {"_seconds":1785438277,"_nanoseconds":535000000} (Timestamp): 1
    {"_seconds":1785338959,"_nanoseconds":592000000} (Timestamp): 1
    {"_seconds":1782305474,"_nanoseconds":245000000} (Timestamp): 1
    {"_seconds":1783356490,"_nanoseconds":990000000} (Timestamp): 1
    {"_seconds":1786407228,"_nanoseconds":810000000} (Timestamp): 1
    {"_seconds":1786059838,"_nanoseconds":16000000} (Timestamp): 1
    {"_seconds":1785435205,"_nanoseconds":633000000} (Timestamp): 1
    {"_seconds":1785432136,"_nanoseconds":881000000} (Timestamp): 1
    {"_seconds":1783353360,"_nanoseconds":263000000} (Timestamp): 1
    {"_seconds":1783347559,"_nanoseconds":836000000} (Timestamp): 1
    {"_seconds":1784552397,"_nanoseconds":859000000} (Timestamp): 1
    {"_seconds":1758568836,"_nanoseconds":6000000} (Timestamp): 1
    {"_seconds":1785367845,"_nanoseconds":109000000} (Timestamp): 1
    {"_seconds":1786055745,"_nanoseconds":818000000} (Timestamp): 1
    {"_seconds":1786055674,"_nanoseconds":257000000} (Timestamp): 1
    {"_seconds":1785451660,"_nanoseconds":823000000} (Timestamp): 1
    {"_seconds":1783514328,"_nanoseconds":441000000} (Timestamp): 1
    {"_seconds":1788195730,"_nanoseconds":896000000} (Timestamp): 1
    {"_seconds":1786061307,"_nanoseconds":306000000} (Timestamp): 1
    {"_seconds":1788191620,"_nanoseconds":755000000} (Timestamp): 1
    {"_seconds":1783531949,"_nanoseconds":771000000} (Timestamp): 1
    {"_seconds":1783514195,"_nanoseconds":502000000} (Timestamp): 1
    {"_seconds":1785250302,"_nanoseconds":270000000} (Timestamp): 1
    {"_seconds":1785339846,"_nanoseconds":405000000} (Timestamp): 1
    {"_seconds":1785322177,"_nanoseconds":194000000} (Timestamp): 1
    {"_seconds":1785412965,"_nanoseconds":34000000} (Timestamp): 1
    {"_seconds":1785503523,"_nanoseconds":796000000} (Timestamp): 1
    {"_seconds":1758548791,"_nanoseconds":392000000} (Timestamp): 1
    {"_seconds":1785432671,"_nanoseconds":396000000} (Timestamp): 1
    {"_seconds":1786407546,"_nanoseconds":668000000} (Timestamp): 1
    {"_seconds":1785339785,"_nanoseconds":219000000} (Timestamp): 1
    {"_seconds":1759264458,"_nanoseconds":394000000} (Timestamp): 1
    {"_seconds":1785509171,"_nanoseconds":630000000} (Timestamp): 1
    {"_seconds":1758109918,"_nanoseconds":454000000} (Timestamp): 1
    {"_seconds":1785503815,"_nanoseconds":909000000} (Timestamp): 1
    {"_seconds":1784804632,"_nanoseconds":525000000} (Timestamp): 1
    {"_seconds":1759263421,"_nanoseconds":467000000} (Timestamp): 1
    {"_seconds":1758546714,"_nanoseconds":38000000} (Timestamp): 1
    {"_seconds":1786062688,"_nanoseconds":41000000} (Timestamp): 1
    {"_seconds":1785252296,"_nanoseconds":604000000} (Timestamp): 1
    {"_seconds":1785421301,"_nanoseconds":848000000} (Timestamp): 1
    {"_seconds":1785240763,"_nanoseconds":727000000} (Timestamp): 1
    {"_seconds":1786060418,"_nanoseconds":906000000} (Timestamp): 1
    {"_seconds":1786059153,"_nanoseconds":46000000} (Timestamp): 1
    {"_seconds":1758547118,"_nanoseconds":691000000} (Timestamp): 1
    {"_seconds":1784044463,"_nanoseconds":331000000} (Timestamp): 1
    {"_seconds":1785238170,"_nanoseconds":889000000} (Timestamp): 1
    {"_seconds":1785339215,"_nanoseconds":167000000} (Timestamp): 1
    {"_seconds":1785845345,"_nanoseconds":340000000} (Timestamp): 1
    {"_seconds":1786015578,"_nanoseconds":534000000} (Timestamp): 1
    {"_seconds":1783350569,"_nanoseconds":232000000} (Timestamp): 1
    {"_seconds":1752438578,"_nanoseconds":551000000} (Timestamp): 1
    {"_seconds":1785423859,"_nanoseconds":574000000} (Timestamp): 1
    {"_seconds":1756807239,"_nanoseconds":262000000} (Timestamp): 1
    {"_seconds":1783355848,"_nanoseconds":908000000} (Timestamp): 1
    {"_seconds":1785431915,"_nanoseconds":500000000} (Timestamp): 1
    {"_seconds":1786018684,"_nanoseconds":100000000} (Timestamp): 1
    {"_seconds":1785505943,"_nanoseconds":906000000} (Timestamp): 1
    {"_seconds":1786020439,"_nanoseconds":91000000} (Timestamp): 1
    {"_seconds":1785505384,"_nanoseconds":843000000} (Timestamp): 1
    {"_seconds":1787583712,"_nanoseconds":875000000} (Timestamp): 1
    {"_seconds":1785250552,"_nanoseconds":664000000} (Timestamp): 1
    {"_seconds":1787943347,"_nanoseconds":381000000} (Timestamp): 1
    {"_seconds":1758548558,"_nanoseconds":811000000} (Timestamp): 1
    {"_seconds":1784044690,"_nanoseconds":552000000} (Timestamp): 1
    {"_seconds":1783518272,"_nanoseconds":21000000} (Timestamp): 1
    {"_seconds":1758546966,"_nanoseconds":186000000} (Timestamp): 1
    {"_seconds":1788436678,"_nanoseconds":806000000} (Timestamp): 1
    {"_seconds":1759265055,"_nanoseconds":575000000} (Timestamp): 1
    {"_seconds":1786406891,"_nanoseconds":275000000} (Timestamp): 1
    {"_seconds":1785323620,"_nanoseconds":569000000} (Timestamp): 1
    {"_seconds":1783532007,"_nanoseconds":800000000} (Timestamp): 1
    {"_seconds":1785329396,"_nanoseconds":39000000} (Timestamp): 1
    {"_seconds":1785754125,"_nanoseconds":657000000} (Timestamp): 1
    {"_seconds":1759263911,"_nanoseconds":333000000} (Timestamp): 1
    {"_seconds":1785847894,"_nanoseconds":814000000} (Timestamp): 1
    {"_seconds":1784827885,"_nanoseconds":85000000} (Timestamp): 1
    {"_seconds":1787943400,"_nanoseconds":704000000} (Timestamp): 1
    {"_seconds":1784747203,"_nanoseconds":822000000} (Timestamp): 1
    {"_seconds":1759263714,"_nanoseconds":873000000} (Timestamp): 1
    {"_seconds":1757769733,"_nanoseconds":121000000} (Timestamp): 1
    {"_seconds":1785336992,"_nanoseconds":291000000} (Timestamp): 1
    {"_seconds":1779492254,"_nanoseconds":97000000} (Timestamp): 1
    {"_seconds":1788191099,"_nanoseconds":587000000} (Timestamp): 1
    {"_seconds":1785358839,"_nanoseconds":390000000} (Timestamp): 1
    {"_seconds":1783353487,"_nanoseconds":427000000} (Timestamp): 1
    {"_seconds":1785250812,"_nanoseconds":890000000} (Timestamp): 1
    {"_seconds":1783534299,"_nanoseconds":646000000} (Timestamp): 1
    {"_seconds":1785754983,"_nanoseconds":294000000} (Timestamp): 1
    {"_seconds":1788193150,"_nanoseconds":256000000} (Timestamp): 1
    {"_seconds":1788191303,"_nanoseconds":161000000} (Timestamp): 1
    {"_seconds":1783518445,"_nanoseconds":162000000} (Timestamp): 1
    {"_seconds":1783515075,"_nanoseconds":787000000} (Timestamp): 1
    {"_seconds":1786059657,"_nanoseconds":88000000} (Timestamp): 1
    {"_seconds":1787942198,"_nanoseconds":153000000} (Timestamp): 1
    {"_seconds":1785505643,"_nanoseconds":361000000} (Timestamp): 1
    {"_seconds":1785250925,"_nanoseconds":614000000} (Timestamp): 1
    {"_seconds":1788118458,"_nanoseconds":305000000} (Timestamp): 1
    {"_seconds":1785426771,"_nanoseconds":848000000} (Timestamp): 1
    {"_seconds":1783535140,"_nanoseconds":716000000} (Timestamp): 1
    {"_seconds":1785855599,"_nanoseconds":963000000} (Timestamp): 1
    {"_seconds":1788367966,"_nanoseconds":699000000} (Timestamp): 1
    {"_seconds":1757516200,"_nanoseconds":173000000} (Timestamp): 1
    {"_seconds":1787943434,"_nanoseconds":921000000} (Timestamp): 1
    {"_seconds":1786407962,"_nanoseconds":985000000} (Timestamp): 1
V2.10 — 'editores' que NO es array: 0
V2.10 — organismos con emails duplicados (case-insensitive) en editores[]: 0
  V2.11 — tipos de legacy_id:
    null (null): 8
    "99" (string): 1
    "66" (string): 1
    "88" (string): 1
    "109" (string): 1
    "103" (string): 1
    "8" (string): 1
    "81" (string): 1
    "37" (string): 1
    "79" (string): 1
    "30" (string): 1
    "42" (string): 1
    "21" (string): 1
    "106" (string): 1
    "36" (string): 1
    "96" (string): 1
    "63" (string): 1
    "98" (string): 1
    "74" (string): 1
    "14" (string): 1
    "59" (string): 1
    "500" (string): 1
    "33" (string): 1
    "91" (string): 1
    "110" (string): 1
    "55" (string): 1
    "12" (string): 1
    "90" (string): 1
    "97" (string): 1
    "41" (string): 1
    "7" (string): 1
    "40" (string): 1
    "80" (string): 1
    "69" (string): 1
    "65" (string): 1
    "39" (string): 1
    "13" (string): 1
    "26" (string): 1
    "19" (string): 1
    "73" (string): 1
    "78" (string): 1
    "29" (string): 1
    "24" (string): 1
    "68" (string): 1
    "108" (string): 1
    "75" (string): 1
    "51" (string): 1
    "95" (string): 1
    "44" (string): 1
    "18" (string): 1
    "200" (string): 1
    "32" (string): 1
    "20" (string): 1
    "6" (string): 1
    "113" (string): 1
    "16" (string): 1
    "105" (string): 1
    "58" (string): 1
    "87" (string): 1
    "111" (string): 1
    "76" (string): 1
    "5" (string): 1
    "101" (string): 1
    "49" (string): 1
    "70" (string): 1
    "17" (string): 1
    "4" (string): 1
    "45" (string): 1
    "84" (string): 1
    "27" (string): 1
    "35" (string): 1
    "2" (string): 1
    "11" (string): 1
    "15" (string): 1
    "23" (string): 1
    "31" (string): 1
    "22" (string): 1
    "48" (string): 1
    "54" (string): 1
    "53" (string): 1
    "25" (string): 1
    "71" (string): 1
    "72" (string): 1
    "1901" (string): 1
    "102" (string): 1
    "10" (string): 1
    "28" (string): 1
    "56" (string): 1
    "89" (string): 1
    "3" (string): 1
    "112" (string): 1
    "67" (string): 1
    "77" (string): 1
    "100" (string): 1
    "1" (string): 1
    "57" (string): 1
    "9" (string): 1
    "92" (string): 1
    "82" (string): 1
    "43" (string): 1
    "38" (string): 1
V1.10 / V2.13 — emails referenciados en usuario_google/editores que NO existen en 'users': 0

## 5. Colección `localidades`

Total localidades: 129
V5.3 — localidades sin nombre: 0, sin provincia: 0
  V5.1 — distribución por provincia:
    "Buenos Aires" (string): 19
    "Entre Rios" (string): 16
    "Corrientes" (string): 13
    "Córdoba" (string): 11
    "Neuquén" (string): 8
    "Rio Negro" (string): 8
    "Chubut" (string): 7
    "Mendoza" (string): 6
    "Chaco" (string): 6
    "Santiago del Estero" (string): 6
    "Santa Fe" (string): 5
    "Salta" (string): 4
    "Tucumán" (string): 4
    "La Pampa" (string): 4
    "Formosa" (string): 3
    "Jujuy" (string): 2
    "San Juan" (string): 2
    "San Luis" (string): 2
    "Tierra del Fuego" (string): 1
    "CABA" (string): 1
    "Catamarca" (string): 1
V5.2 — pares (nombre, provincia) duplicados: 0
  V5.4 — tipos de latitud:
    -41.13297819 (number): 2
    -54.80722558559848 (number): 1
    -23.2499521 (number): 1
    -33.3310506065996 (number): 1
    -43.3015853 (number): 1
    -24.23041734 (number): 1
    -27.58860218 (number): 1
    -30.23959465 (number): 1
    -31.60359332 (number): 1
    -28.50636799 (number): 1
    -34.97786206 (number): 1
    -26.79924421 (number): 1
    -26.83422059 (number): 1
    -35.66002273 (number): 1
    -28.25561793 (number): 1
    -28.63800179 (number): 1
    -30.0048066 (number): 1
    -34.920219709584835 (number): 1
    -31.6521573 (number): 1
    -32.21920762 (number): 1
    -38.90234156 (number): 1
    -23.127641408751032 (number): 1
    -38.93740038 (number): 1
    -38.9203997 (number): 1
    -34.1260408 (number): 1
    -34.57550766953005 (number): 1
    -32.39032738 (number): 1
    -42.90954789 (number): 1
    -29.463712 (number): 1
    -40.7324505 (number): 1
    -22.516694264724276 (number): 1
    -34.09487601305979 (number): 1
    -38.71878984675008 (number): 1
    -28.46059446 (number): 1
    -29.1235924 (number): 1
    -30.25295151 (number): 1
    -33.14985187 (number): 1
    -27.16627127 (number): 1
    -28.47056406 (number): 1
    -32.47729139 (number): 1
    -45.7787611 (number): 1
    -37.99982378363288 (number): 1
    -26.53787329 (number): 1
    -31.42143557386237 (number): 1
    -36.62006915 (number): 1
    -34.650915761458094 (number): 1
    -34.65587405859225 (number): 1
    -25.28771911 (number): 1
    -39.2892205 (number): 1
    -32.1764652 (number): 1
    -27.45090653 (number): 1
    -34.470817529247135 (number): 1
    -42.06102097 (number): 1
    -34.59774886901886 (number): 1
    -34.6111262 (number): 1
    -27.21761066 (number): 1
    -27.34618315 (number): 1
    -40.76256889 (number): 1
    -30.9514011 (number): 1
    -32.0694548 (number): 1
    -29.79059285 (number): 1
    -29.71382184 (number): 1
    -35.97205472471794 (number): 1
    -33.891356944666335 (number): 1
    -45.58675317 (number): 1
    -27.78097427 (number): 1
    -24.70103825 (number): 1
    -33.67289821 (number): 1
    -42.76376685 (number): 1
    -38.9535195 (number): 1
    -37.37859515 (number): 1
    -40.81189569 (number): 1
    -37.39436189 (number): 1
    -34.720630472703014 (number): 1
    -33.4206584 (number): 1
    -31.74103465 (number): 1
    -31.263328 (number): 1
    -28.55244944 (number): 1
    -25.8668504 (number): 1
    -31.2468128 (number): 1
    -31.86738726 (number): 1
    -32.6974728 (number): 1
    -32.88909961 (number): 1
    -39.10161328 (number): 1
    -31.65874519727135 (number): 1
    -34.76066215875011 (number): 1
    -32.62208918 (number): 1
    -32.30125553 (number): 1
    -30.98466851 (number): 1
    -24.18527504 (number): 1
    -38.9170117 (number): 1
    -30.4227788 (number): 1
    -40.1604971 (number): 1
    -38.553890755143875 (number): 1
    -30.75773272 (number): 1
    -36.778585959455924 (number): 1
    -29.18353869 (number): 1
    -30.9821421 (number): 1
    -33.00872476 (number): 1
    -34.5881416724121 (number): 1
    -26.80648533 (number): 1
    -33.57749187 (number): 1
    -37.36895366 (number): 1
    -27.73347054 (number): 1
    -39.95112801 (number): 1
    -30.37885667 (number): 1
    -31.5504382 (number): 1
    -31.41722213 (number): 1
    -30.75899107 (number): 1
    -27.49852627 (number): 1
    -27.46947409 (number): 1
    -33.0806252 (number): 1
    -28.05425203 (number): 1
    -36.21680356 (number): 1
    -26.1401194 (number): 1
    -36.31344127243891 (number): 1
    -43.24856653 (number): 1
    -33.3023848 (number): 1
    -25.80800707 (number): 1
    -28.26694299 (number): 1
    -27.57628633 (number): 1
    -33.74485652 (number): 1
    -25.49445606 (number): 1
    -32.95794376 (number): 1
    -35.48444508 (number): 1
    -34.74396965778271 (number): 1
    -31.39138977 (number): 1
  V5.4 — tipos de longitud:
    -71.30489917 (number): 2
    -68.30547849321061 (number): 1
    -63.3365558 (number): 1
    -60.209467404239255 (number): 1
    -65.0705776 (number): 1
    -64.86987745 (number): 1
    -56.69013106 (number): 1
    -68.74519186 (number): 1
    -60.70982084 (number): 1
    -59.04398142 (number): 1
    -67.68987555 (number): 1
    -60.43306708 (number): 1
    -65.16451766 (number): 1
    -63.75583353 (number): 1
    -58.62351252 (number): 1
    -65.12939495 (number): 1
    -59.5276666 (number): 1
    -57.95454461026926 (number): 1
    -63.9103986 (number): 1
    -58.14845777 (number): 1
    -70.06351071 (number): 1
    -64.32051014808557 (number): 1
    -69.23147964 (number): 1
    -67.9729307 (number): 1
    -63.3908846 (number): 1
    -58.536649814397265 (number): 1
    -59.79499874 (number): 1
    -71.31435963 (number): 1
    -60.20538593 (number): 1
    -64.9686051 (number): 1
    -63.804106592447404 (number): 1
    -59.02405713681084 (number): 1
    -62.26598826092406 (number): 1
    -62.83304317 (number): 1
    -59.2533125 (number): 1
    -57.63654138 (number): 1
    -59.31011351 (number): 1
    -65.50566528 (number): 1
    -65.77619076 (number): 1
    -58.23591984 (number): 1
    -67.6693654 (number): 1
    -57.54234664690132 (number): 1
    -59.3429306 (number): 1
    -64.49973760905308 (number): 1
    -64.29334009 (number): 1
    -59.432078110624786 (number): 1
    -58.61726070438553 (number): 1
    -57.72135543 (number): 1
    -65.66075781 (number): 1
    -64.1132646 (number): 1
    -58.98092665 (number): 1
    -58.52721674585139 (number): 1
    -71.59844113 (number): 1
    -58.93687104005704 (number): 1
    -68.34046044 (number): 1
    -61.18835186 (number): 1
    -65.59045026 (number): 1
    -71.64221946 (number): 1
    -58.78371009 (number): 1
    -60.63893786 (number): 1
    -58.06258312 (number): 1
    -57.08232986 (number): 1
    -62.73376152613115 (number): 1
    -60.57590169121304 (number): 1
    -69.07050193 (number): 1
    -64.26913391 (number): 1
    -60.58964542 (number): 1
    -65.45106975 (number): 1
    -65.01673979 (number): 1
    -68.0598049 (number): 1
    -70.27107842 (number): 1
    -62.99911054 (number): 1
    -68.92685619 (number): 1
    -58.254702339225176 (number): 1
    -63.2981358 (number): 1
    -60.51084426 (number): 1
    -61.5171766 (number): 1
    -56.04679132 (number): 1
    -60.5561686 (number): 1
    -64.4646549 (number): 1
    -59.02942758 (number): 1
    -62.1066068 (number): 1
    -68.84796212 (number): 1
    -67.090922 (number): 1
    -64.42683290140593 (number): 1
    -58.42928351066405 (number): 1
    -60.15640548 (number): 1
    -59.15140661 (number): 1
    -57.91708808 (number): 1
    -65.30143989 (number): 1
    -67.9765144 (number): 1
    -64.3512395 (number): 1
    -71.3635838 (number): 1
    -58.73954425616189 (number): 1
    -57.99120924 (number): 1
    -59.861015991438144 (number): 1
    -58.07503352 (number): 1
    -64.0950666 (number): 1
    -58.53044526 (number): 1
    -60.95148352997614 (number): 1
    -65.22259748 (number): 1
    -69.01512893 (number): 1
    -64.60086572 (number): 1
    -64.24333297 (number): 1
    -71.0700935 (number): 1
    -58.73177627 (number): 1
    -68.5716608 (number): 1
    -64.18255138 (number): 1
    -59.64083502 (number): 1
    -64.85968284 (number): 1
    -58.82802863 (number): 1
    -68.47198418 (number): 1
    -56.01678703 (number): 1
    -65.43794722 (number): 1
    -58.1553031 (number): 1
    -57.67890494301613 (number): 1
    -65.30687102 (number): 1
    -66.33764751 (number): 1
    -62.82534845 (number): 1
    -58.11729754 (number): 1
    -60.71233435 (number): 1
    -61.97335591 (number): 1
    -64.97118073 (number): 1
    -60.70385239 (number): 1
    -69.5798154 (number): 1
    -58.615769724390084 (number): 1
    -58.01761748 (number): 1

## 6. Colección `pools_jueces`

Total pools_jueces: 30
V6.3 — sin descripcion: 0, sin provincia: 0, sin cantidad_jueces: 0
  V6.1 — distribución por provincia:
    "Buenos Aires" (string): 18
    "Córdoba" (string): 7
    "Neuquén" (string): 3
    "Salta" (string): 1
    "Catamarca" (string): 1
  V6.4 — tipos de cantidad_jueces:
    3 (number): 6
    6 (number): 5
    21 (number): 2
    40 (number): 2
    9 (number): 2
    7 (number): 2
    11 (number): 2
    36 (number): 1
    12 (number): 1
    13 (number): 1
    33 (number): 1
    29 (number): 1
    4 (number): 1
    32 (number): 1
    54 (number): 1
    5 (number): 1

## 3. Subcolección `unidades_funcionales`

V3.1 — Total UF: 277. Organismos con 0 UF: 0
  V3.2 — valores distintos de tipo_uf:
    "Delegación" (string): 225
    "Subdelegación" (string): 46
    "Área Específica" (string): 6
V3.3 — UF con jueces_asistidos Y pool_jueces_id poblados a la vez: 0
V3.3 — UF con NINGUNO de los dos poblado: 2
V3.4 — UF con cada campo obligatorio vacío/ausente:
    denominacion_unidad: 0
    localidad_id: 0
    tipo_uf: 0
    domicilio: 2
    codigo_postal: 2
    telefono: 12
    mail: 10
    responsable: 12
    jueces_asistidos: 36
    anio_implementacion: 1
V3.5 — UF sin el campo pool_jueces_id en absoluto: 152
  V3.6 — valores de jueces_asistidos no convertibles a número:
  V3.7 — valores de anio_implementacion fuera de rango razonable:
    "1/7/2021" (string): 3
    "1/9/2020" (string): 2
    "1/11/2020" (string): 2
    "" (string): 1
    "2015. Refuncionalización 2024" (string): 1
    "13/03/2022" (string): 1
    "7/07/2022" (string): 1
    "1/3/2021" (string): 1
    "1/11/2023" (string): 1
    "7/7/2022" (string): 1
    "1/7/2022" (string): 1
    "8/11/2022" (string): 1
    "año 2023" (string): 1
    "9" (string): 1
V3.9 — UF con localidad_id roto (no existe en localidades): 0
V3.10 — UF con pool_jueces_id roto (no existe en pools_jueces): 0
V3.11 — UF en modo pool donde la provincia del pool no coincide con la del organismo: 0

## 4. Subcolección `taxonomia`

V4.1 — organismos CON doc taxonomia/v1 (al menos uno): 89. SIN ninguno: 27
V0.3 / V7.2 — organismos con MÁS de un documento en taxonomia: 0
V0.3 — documentos de taxonomia con id distinto de 'v1': 0 
V4.2 — organismos cuyo tipo_oficina exige taxonomía: 88, de esos con las 9 columnas completas: 88
V4.4 — documentos v1 con cada campo ausente/vacío:
    gestion.autonomia: 0
    institucional.insercion_institucional: 0
    institucional.jerarquia_normativa: 0
    organizacion.dependencia: 0
    organizacion.asistencia_jurisdiccional: 0
    implementacion.alcance_proceso: 0
    implementacion.alcance_fuero: 0
    implementacion.presencia_territorial: 0
    implementacion.grado_implementacion: 0
V4.5 — grupos anidados presentes pero vacíos ({}): 0

## Nota

V6.6 (localidades huérfanas no referenciadas por ninguna UF) y V4.8 (cruce taxonomía
completa vs. 0 UF) no están en este script — son cruces de bajo impacto en el modelo
relacional; correrlos aparte si hace falta para el plan.
