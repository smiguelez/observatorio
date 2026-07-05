import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const UF_CAMPOS = [
  'denominacion_unidad', 'localidad_id', 'tipo_uf', 'domicilio',
  'codigo_postal', 'telefono', 'mail', 'responsable',
  'jueces_asistidos', 'anio_implementacion',
];

const TAXONOMIA_CAMPOS = [
  ['gestion', 'autonomia'],
  ['institucional', 'insercion_institucional'],
  ['institucional', 'jerarquia_normativa'],
  ['organizacion', 'dependencia'],
  ['organizacion', 'asistencia_jurisdiccional'],
  ['implementacion', 'alcance_proceso'],
  ['implementacion', 'alcance_fuero'],
  ['implementacion', 'presencia_territorial'],
  ['implementacion', 'grado_implementacion'],
];

const TIPOS_CON_TAXONOMIA = ['OFICINA JUDICIAL', 'OFICINA JUDICIAL ESPECIALIZADA'];

function evaluarUF(data) {
  const faltantes = UF_CAMPOS.filter(c => !data[c] || String(data[c]).trim() === '');
  const errores = faltantes.length > 0 ? [`Campos faltantes: ${faltantes.join(', ')}`] : [];

  const ja = data.jueces_asistidos;
  if (ja && String(ja).trim() !== '' && isNaN(Number(ja))) {
    errores.push('jueces_asistidos: debe ser numérico');
  }

  return errores.length === 0
    ? { completa: true }
    : { completa: false, motivo: errores.join(' — ') };
}

function evaluarOrganismo(ufs, taxonomia, tipo_oficina) {
  if (ufs.length === 0) {
    return { completo: false, motivo: 'Sin unidades funcionales' };
  }

  if (TIPOS_CON_TAXONOMIA.includes(tipo_oficina)) {
    if (!taxonomia) {
      return { completo: false, motivo: 'Taxonomía incompleta: todos los campos ausentes' };
    }
    const faltantesTax = TAXONOMIA_CAMPOS
      .filter(([g, c]) => !taxonomia?.[g]?.[c] || String(taxonomia[g][c]).trim() === '')
      .map(([g, c]) => `${g}.${c}`);
    if (faltantesTax.length > 0) {
      return { completo: false, motivo: `Taxonomía incompleta: ${faltantesTax.join(', ')}` };
    }
  }

  const ufInc = ufs.find(uf => !uf.evaluacion.completa);
  if (ufInc) {
    return { completo: false, motivo: `UF incompleta: "${ufInc.denominacion_unidad || ufInc.id}"` };
  }

  return { completo: true };
}

function calcularResumenPorUsuario(organismos) {
  const resumen = {};
  for (const org of organismos) {
    const usuario = org.usuario_google || 'Sin usuario';
    if (!resumen[usuario]) resumen[usuario] = { completas: 0, incompletas: 0 };
    for (const uf of org.ufs) {
      if (uf.evaluacion.completa) resumen[usuario].completas++;
      else resumen[usuario].incompletas++;
    }
  }
  return resumen;
}

function agruparPorProvincia(organismos) {
  const agrupado = {};
  for (const org of organismos) {
    const prov = org.provincia || 'Sin provincia';
    if (!agrupado[prov]) agrupado[prov] = [];
    agrupado[prov].push(org);
  }
  return agrupado;
}

function getNombreLocalidad(id, localidadesMap) {
  const loc = localidadesMap.get(id);
  return loc ? `${loc.nombre} (${loc.provincia})` : id || '—';
}

function exportarPDF(provincia, orgs, localidadesMap) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fecha = new Date().toLocaleDateString('es-AR');
  const margen = 14;

  // Título
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(`Provincia: ${provincia}`, margen, 18);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Reporte de completitud — Generado: ${fecha}`, margen, 25);

  // Tabla resumen de organismos
  autoTable(doc, {
    startY: 30,
    head: [['Organismo', 'Tipo oficina', 'Usuario', 'Estado', 'Motivo']],
    body: orgs.map(org => [
      org.denominacion || '(sin denominación)',
      org.tipo_oficina || '—',
      org.usuario_google || '—',
      org.evaluacion.completo ? 'Completo' : 'Incompleto',
      org.evaluacion.completo ? '' : (org.evaluacion.motivo || ''),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [55, 65, 81] },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 38 }, 2: { cellWidth: 42 }, 3: { cellWidth: 20 }, 4: { cellWidth: 'auto' } },
    didParseCell(data) {
      if (data.column.index === 3 && data.section === 'body') {
        data.cell.styles.fillColor = data.cell.raw === 'Completo'
          ? [198, 239, 206]
          : [255, 199, 206];
      }
    },
  });

  // Detalle de UFs por organismo
  for (const org of orgs) {
    const y = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(org.denominacion || '(sin denominación)', margen, y);

    if (org.ufs.length === 0) {
      doc.setFontSize(9);
      doc.setFont(undefined, 'italic');
      doc.text('Sin unidades funcionales', margen + 2, y + 5);
      // Crear un lastAutoTable ficticio avanzando el cursor
      autoTable(doc, {
        startY: y + 7,
        body: [],
        styles: { fontSize: 1 },
      });
    } else {
      autoTable(doc, {
        startY: y + 3,
        head: [['Unidad funcional', 'Localidad', 'Tipo UF', 'Estado', 'Motivo']],
        body: org.ufs.map(uf => [
          uf.denominacion_unidad || '(sin nombre)',
          getNombreLocalidad(uf.localidad_id, localidadesMap),
          uf.tipo_uf || '—',
          uf.evaluacion.completa ? 'Completa' : 'Incompleta',
          uf.evaluacion.completa ? '' : (uf.evaluacion.motivo || ''),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [75, 85, 99] },
        columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 45 }, 2: { cellWidth: 25 }, 3: { cellWidth: 22 }, 4: { cellWidth: 'auto' } },
        didParseCell(data) {
          if (data.column.index === 3 && data.section === 'body') {
            data.cell.styles.fillColor = data.cell.raw === 'Completa'
              ? [198, 239, 206]
              : [255, 199, 206];
          }
        },
      });
    }
  }

  const provSlug = provincia
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
  const fechaSlug = new Date().toISOString().slice(0, 10);
  doc.save(`reporte_${provSlug}_${fechaSlug}.pdf`);
}

export default function OrganismosFormulario() {
  const [organismos, setOrganismos] = useState([]);
  const [localidades, setLocalidades] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [abiertos, setAbiertos] = useState(new Set());

  useEffect(() => {
    const fetchTodo = async () => {
      try {
        const [organismoSnap, localidadSnap] = await Promise.all([
          getDocs(collection(db, 'organismos')),
          getDocs(collection(db, 'localidades')),
        ]);

        const locMap = new Map(
          localidadSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }])
        );

        const base = organismoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const enriquecidos = await Promise.all(
          base.map(async (org) => {
            const [ufsSnap, taxSnap] = await Promise.all([
              getDocs(collection(db, `organismos/${org.id}/unidades_funcionales`)),
              getDoc(doc(db, `organismos/${org.id}/taxonomia/v1`)),
            ]);

            const ufs = ufsSnap.docs.map(d => ({
              id: d.id,
              ...d.data(),
              evaluacion: evaluarUF(d.data()),
            }));

            const taxonomia = taxSnap.exists() ? taxSnap.data() : null;
            return { ...org, ufs, evaluacion: evaluarOrganismo(ufs, taxonomia, org.tipo_oficina) };
          })
        );

        setLocalidades(locMap);
        setOrganismos(enriquecidos);
      } catch (error) {
        console.error('Error al obtener datos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTodo();
  }, []);

  const toggleProvincia = (provincia) => {
    setAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(provincia)) next.delete(provincia);
      else next.add(provincia);
      return next;
    });
  };

  if (loading) return <div className="p-4">Cargando organismos...</div>;

  const resumenPorUsuario = calcularResumenPorUsuario(organismos);
  const porProvincia = agruparPorProvincia(organismos);
  const provinciasOrdenadas = Object.keys(porProvincia).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-10">

      {/* Sección 1: Resumen por usuario */}
      <section>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Resumen de completitud por usuario
        </h2>
        <div className="space-y-2">
          {Object.entries(resumenPorUsuario)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([usuario, { completas, incompletas }]) => (
              <div key={usuario} className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                <span className="font-medium">{usuario}:</span>
                <span className="text-green-700 font-medium">{completas} completas</span>
                <span className="text-gray-400">/</span>
                <span className="text-red-600 font-medium">{incompletas} incompletas</span>
                <span className="text-gray-400 text-xs">({completas + incompletas} UF totales)</span>
              </div>
            ))}
        </div>
      </section>

      {/* Sección 2: Detalle por provincia */}
      <section>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Detalle por provincia
        </h2>
        <div className="space-y-2">
          {provinciasOrdenadas.map(provincia => {
            const orgs = porProvincia[provincia]
              .slice()
              .sort((a, b) => (a.denominacion || '').localeCompare(b.denominacion || ''));
            const completos = orgs.filter(o => o.evaluacion.completo).length;
            const abierto = abiertos.has(provincia);

            return (
              <div key={provincia} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleProvincia(provincia)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="font-semibold text-gray-800">{provincia}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${completos === orgs.length ? 'text-green-700' : 'text-red-600'}`}>
                      {completos} de {orgs.length} organismos completos
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); exportarPDF(provincia, orgs, localidades); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); exportarPDF(provincia, orgs, localidades); } }}
                      className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Exportar PDF
                    </span>
                    <span className="text-gray-400 text-sm">{abierto ? '▲' : '▼'}</span>
                  </div>
                </button>

                {abierto && (
                  <div className="divide-y">
                    {orgs.map(org => (
                      <OrganismoAcordeon
                        key={org.id}
                        organismo={org}
                        localidadesMap={localidades}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}

// ─── Sección 2: componentes acordeón ────────────────────────────────────────

function OrganismoAcordeon({ organismo, localidadesMap }) {
  const { evaluacion, ufs } = organismo;

  return (
    <div className={`px-4 py-3 ${evaluacion.completo ? 'bg-white' : 'bg-red-50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <span className="font-medium text-gray-800">
          {organismo.denominacion || '(sin denominación)'}
        </span>
        <span className="text-xs text-gray-500">{organismo.usuario_google}</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          evaluacion.completo ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
        }`}>
          {evaluacion.completo ? 'Completo' : 'Incompleto'}
        </span>
        {!evaluacion.completo && (
          <span className="text-xs text-red-600">{evaluacion.motivo}</span>
        )}
      </div>

      {ufs.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Sin unidades funcionales</p>
      ) : (
        <div className="space-y-2 pl-3 border-l-2 border-gray-200">
          {ufs.map(uf => (
            <UFAcordeon key={uf.id} uf={uf} localidadesMap={localidadesMap} />
          ))}
        </div>
      )}
    </div>
  );
}

function UFAcordeon({ uf, localidadesMap }) {
  const { evaluacion } = uf;
  const nombreLocalidad = getNombreLocalidad(uf.localidad_id, localidadesMap);

  return (
    <div className={`rounded p-2 text-xs ${evaluacion.completa ? 'bg-gray-50' : 'bg-orange-50'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-medium text-gray-700">
          {uf.denominacion_unidad || '(sin nombre)'}
        </span>
        <span className={`px-1.5 py-0.5 rounded-full font-medium ${
          evaluacion.completa ? 'bg-green-100 text-green-700' : 'bg-orange-200 text-orange-800'
        }`}>
          {evaluacion.completa ? 'Completa' : 'Incompleta'}
        </span>
        {!evaluacion.completa && (
          <span className="text-orange-700">{evaluacion.motivo}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 text-gray-600">
        <div>
          <span className="text-gray-400">Localidad: </span>
          <span>{nombreLocalidad}</span>
        </div>
        <div>
          <span className="text-gray-400">Tipo UF: </span>
          <span className={!uf.tipo_uf ? 'text-red-400 italic' : ''}>{uf.tipo_uf || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Año: </span>
          <span className={!uf.anio_implementacion ? 'text-red-400 italic' : ''}>{uf.anio_implementacion || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Responsable: </span>
          <span className={!uf.responsable ? 'text-red-400 italic' : ''}>{uf.responsable || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Mail: </span>
          <span className={!uf.mail ? 'text-red-400 italic' : ''}>{uf.mail || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Teléfono: </span>
          <span className={!uf.telefono ? 'text-red-400 italic' : ''}>{uf.telefono || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Domicilio: </span>
          <span className={!uf.domicilio ? 'text-red-400 italic' : ''}>{uf.domicilio || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">CP: </span>
          <span className={!uf.codigo_postal ? 'text-red-400 italic' : ''}>{uf.codigo_postal || '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Jueces asistidos: </span>
          <span className={!uf.jueces_asistidos ? 'text-red-400 italic' : ''}>{uf.jueces_asistidos || '—'}</span>
        </div>
      </div>
    </div>
  );
}
