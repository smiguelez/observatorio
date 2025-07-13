import React, { useEffect } from 'react';
import { taxonomiaOptions } from '@/constants/taxonomiaOptions';

export default function TaxonomiaForm({ taxonomia, tipo_oficina, onChange }) {
  const oficinasSinTaxonomia = ['coordinación', 'unidad operativa'];

  if (oficinasSinTaxonomia.includes(tipo_oficina)) {
    return (
      <div className="p-4 border rounded bg-yellow-50 text-yellow-800 text-sm">
        ⚠ La taxonomía no corresponde para este tipo de oficina:{" "}
        <strong>{tipo_oficina}</strong>
      </div>
    );
  }

  const handleChange = (dimension, campo, value) => {
    const nuevaTaxonomia = {
      v1: {
        ...taxonomia?.v1,
        [dimension]: {
          ...(taxonomia?.v1?.[dimension] || {}),
          [campo]: value,
        },
      },
    };

    if (typeof onChange === "function") {
      onChange(nuevaTaxonomia);
    }
  };

  return (
    <div className="space-y-8">
      {Object.entries(taxonomiaOptions).map(([dimension, campos]) => (
        <div
          key={dimension}
          className="border p-4 rounded-xl shadow bg-blue-100"
        >
          <h2 className="text-lg font-semibold capitalize mb-4">{dimension}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(campos).map(([campo, opciones]) => (
              <div key={campo}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {campo.replace(/_/g, ' ')}
                </label>

                <p className="text-xs text-gray-500 mb-1">
                  Valor actual: {taxonomia?.v1?.[dimension]?.[campo] || "(vacío)"}
                </p>

                <select
                  value={taxonomia?.v1?.[dimension]?.[campo] || ''}
                  onChange={(e) =>
                    handleChange(dimension, campo, e.target.value)
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {opciones.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
