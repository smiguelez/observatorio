import React from 'react';
import { Input } from '@/components/ui/input';

export default function OrganismoForm({ organismo, setOrganismo }) {
  const handleChange = (e) => {
    setOrganismo({ ...organismo, [e.target.name]: e.target.value });
  };

  // Opciones hardcodeadas para denominación simplificada
  const denominacionSimplificadaOptions = [
    "OFICINA JUDICIAL",
    "OFICINA DE IMPUGNACIÓN",
    "DIRECCION GRAL DE OFICINAS JUDICIALES",
    "OFICINA DE TRAMITACION INTEGRAL",
    "COORDINACION OFICINAS JUDICIALES",
    "OFICINA DE GESTIÓN DE AUDIENCIAS",
    "OFICINA DE GESTIÓN UNICA",
    "OFICINA JUDICIAL CENTRAL",
    "OFICINA JUDICIAL DE JUICIO POR JURADOS",
    "OFICINA DE GESTIÓN UNIFICADA",
    "TRIBUNAL DE GESTIÓN ASOCIADA",
    "OFICINA DE PROCESOS",
    "OFICINA DE TRAMITES",
    "OFICINA GESTIÓN Y APOYO",
    "OFICINA DE GESTIÓN JUDICIAL",
    "OFICINA DE RECEPCIÓN DE EXPEDIENTES",
    "MESA ENTRADAS",
    "OFICINA DE COORDINACIÓN",
    "OFICINA UNICA",
    "OFICINA DE ATENCIÓN CENTRALIZADA",
    "OFICINA DE ENTRADA",
    "UNIDAD DE SEGUIMIENTO",
    "UNIDAD DE COORDINACIÓN",
    "OFICINA DE SERVICIOS PROCESALES",
    "OFICINA DE JURADOS",
    "OFICINA DE GESTIÓN COMUN",
    "OFICINA DE PROCESOS SUCESORIOS",
    "SECRETARIA DE GESTIÓN ADMINISTRATIVA",
    "OFICINA DE GESTIÓN ADMINISTRATIVA",
    "OFICINA JUDICIAL DE GESTIÓN ASOCIADA",
    "GESTIÓN JUDICIAL ASOCIADA",
    "OFICINA JUDICIAL DE AUDIENCIAS",
    "OFICINA CENTRAL DE JUICIOS POR JURADOS",
    "OFICINA DE GESTION ASOCIADA",
    "COORDINACION OGA",
    "OFICINA DE COORDINACION ESTRATEGICA DE PLANIFICACION Y GESTION",
    "OFICINA DE GESTION JUDICIAL",
    "OFICINA DE GESTIÓN DIGITAL",
    "COMISIÓN TÉCNICA"
  ];

  // Opciones hardcodeadas para tipo de oficina
  const tipoOficinaOptions = [
    "oficina judicial",  
    "oficina judicial especializada",
    "coordinación",
    "unidad operativa"
  ];

  const valorActualDenominacion = (organismo.denominacion_simplificada || '').trim();
  const existeEnOpcionesDenominacion = denominacionSimplificadaOptions.includes(valorActualDenominacion);

  const valorActualTipoOficina = (organismo.tipo_oficina || '').trim();
  const existeEnOpcionesTipoOficina = tipoOficinaOptions.includes(valorActualTipoOficina);

  const getActualizadoA = () => {
    if (organismo.actualizado_a) {
      if (organismo.actualizado_a instanceof Object && 'toDate' in organismo.actualizado_a) {
        return organismo.actualizado_a.toDate().toLocaleString();
      } else if (typeof organismo.actualizado_a === 'string') {
        const date = new Date(organismo.actualizado_a);
        return date.toLocaleString();
      }
    }
    return null;
  };

  return (
    <div className="space-y-6 px-6 w-full">
      <h2 className="text-xl font-semibold text-gray-800">Detalle del Organismo</h2>

      <div className="grid grid-cols-[200px_1fr] gap-y-4 gap-x-6 items-center max-w-4xl">
        <label htmlFor="denominacion" className="text-left font-medium text-gray-700">
          Denominación:
        </label>
        <Input
          id="denominacion"
          name="denominacion"
          value={organismo.denominacion || ''}
          onChange={handleChange}
          placeholder="Denominación"
        />

        <label htmlFor="denominacion_simplificada" className="text-left font-medium text-gray-700">
          Denominación Simplificada:
        </label>
        <select
          id="denominacion_simplificada"
          name="denominacion_simplificada"
          value={valorActualDenominacion}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
        >
          {!existeEnOpcionesDenominacion && valorActualDenominacion && (
            <option value={valorActualDenominacion}>
              {valorActualDenominacion} (valor existente no listado)
            </option>
          )}
          <option value="">Seleccionar Denominación Simplificada</option>
          {denominacionSimplificadaOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <label htmlFor="tipo_oficina" className="text-left font-medium text-gray-700">
          Tipo de Oficina:
        </label>
        <select
          id="tipo_oficina"
          name="tipo_oficina"
          value={valorActualTipoOficina}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
        >
          {!existeEnOpcionesTipoOficina && valorActualTipoOficina && (
            <option value={valorActualTipoOficina}>
              {valorActualTipoOficina} (valor existente no listado)
            </option>
          )}
          <option value="">Seleccionar Tipo de Oficina</option>
          {tipoOficinaOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <label htmlFor="provincia" className="text-left font-medium text-gray-700">
          Provincia:
        </label>
        <Input
          id="provincia"
          name="provincia"
          value={organismo.provincia || ''}
          disabled
          className="bg-gray-100 text-gray-700 cursor-not-allowed"
          placeholder="Provincia"
        />

        <label htmlFor="legacy_id" className="text-left font-medium text-gray-700">
          Código Original:
        </label>
        <Input
          id="legacy_id"
          name="legacy_id"
          value={organismo.legacy_id || ''}
          disabled
          className="bg-gray-100 text-gray-700 cursor-not-allowed"
          placeholder="Código Original"
        />
      </div>

      {getActualizadoA() ? (
        <p className="text-sm text-gray-500 mt-4">
          Última actualización: {getActualizadoA()}
        </p>
      ) : (
        <p className="text-sm text-gray-500 mt-4">
          Última actualización no disponible.
        </p>
      )}
    </div>
  );
}
