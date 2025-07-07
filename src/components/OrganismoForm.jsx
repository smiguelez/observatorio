import React from 'react';
import { Input } from '@/components/ui/input';

export default function OrganismoForm({ organismo, setOrganismo }) {
  const handleChange = (e) => {
    setOrganismo({ ...organismo, [e.target.name]: e.target.value });
  };

  // Verificar si 'actualizado_a' es un Timestamp válido y convertirlo
  const getActualizadoA = () => {
    if (organismo.actualizado_a) {
      // Verificar si es un objeto Timestamp de Firestore
      if (organismo.actualizado_a instanceof Object && 'toDate' in organismo.actualizado_a) {
        return organismo.actualizado_a.toDate().toLocaleString();
      }
      // Si es una cadena de texto, podemos intentar convertirla
      else if (typeof organismo.actualizado_a === 'string') {
        const date = new Date(organismo.actualizado_a);
        return date.toLocaleString();
      }
    }
    return null;  // Si no es un timestamp válido o cadena, retornamos null
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
        <Input
          id="denominacion_simplificada"
          name="denominacion_simplificada"
          value={organismo.denominacion_simplificada || ''}
          onChange={handleChange}
          placeholder="Denominación Simplificada"
        />

        <label htmlFor="tipo_oficina" className="text-left font-medium text-gray-700">
          Tipo de Oficina:
        </label>
        <Input
          id="tipo_oficina"
          name="tipo_oficina"
          value={organismo.tipo_oficina || ''}
          onChange={handleChange}
          placeholder="Tipo de Oficina"
        />

        <label htmlFor="provincia" className="text-left font-medium text-gray-700">
          Provincia:
        </label>
        <Input
          id="provincia"
          name="provincia"
          value={organismo.provincia || ''}
          onChange={handleChange}
          placeholder="Provincia"
        />

        <label htmlFor="legacy_id" className="text-left font-medium text-gray-700">
          Código Original:
        </label>
        <Input
          id="legacy_id"
          name="legacy_id"
          value={organismo.legacy_id || ''}
          onChange={handleChange}
          placeholder="Código Original"
        />
      </div>

      {/* Mostrar la última actualización */}
      {getActualizadoA() ? (
        <p className="text-sm text-gray-500 mt-4">
          Última actualización: {getActualizadoA()}
        </p>
      ) : (
        <p className="text-sm text-gray-500 mt-4">Última actualización no disponible.</p>
      )}
    </div>
  );
}
