import React from 'react';
import { Input } from '@/components/ui/input';
import {
  denominacionSimplificadaOptions,
  tipoOficinaOptions,
  fueroOptions
} from '@/constants/organismoOptions';

export default function OrganismoForm({ organismo, setOrganismo }) {
  const handleChange = (e) => {
    setOrganismo({ ...organismo, [e.target.name]: e.target.value });
  };

  const valorActualDenominacion = (organismo.denominacion_simplificada || '').trim();
  const existeEnOpcionesDenominacion = denominacionSimplificadaOptions.includes(valorActualDenominacion);

  const valorActualTipoOficina = (organismo.tipo_oficina || '').trim();
  const existeEnOpcionesTipoOficina = tipoOficinaOptions.includes(valorActualTipoOficina);

  const valorActualFuero = (organismo.fuero_simplificado || '').trim().toLowerCase();
  const existeEnOpcionesFuero = fueroOptions.includes(valorActualFuero);

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

        <label htmlFor="fuero_simplificado" className="text-left font-medium text-gray-700">
          Fuero:
        </label>
        <select
          id="fuero_simplificado"
          name="fuero_simplificado"
          value={valorActualFuero}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
        >
          {!existeEnOpcionesFuero && valorActualFuero && (
            <option value={valorActualFuero}>
              {valorActualFuero} (valor existente no listado)
            </option>
          )}
          <option value="">Seleccionar Fuero</option>
          {fueroOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
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
