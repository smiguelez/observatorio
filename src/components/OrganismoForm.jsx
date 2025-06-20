import React, { useState, useEffect } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";

const provincias = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut",
  "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy",
  "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén",
  "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz",
  "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"
];

const tiposOficina = [
  "Oficina Judicial", "Oficina Judicial Especializada", "Unidad Operativa", "Coordinación", "Otra"
];

const opcionesGestion = ["Sí", "No", "Parcial"];

export default function OrganismoForm({ user, onSaved }) {
  const [form, setForm] = useState({
    provincia: "",
    denominacion: "",
    denominacion_simplificada: "",
    tipo_oficina: "",
    gestiona_procesos: ""
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "organismos"), {
        ...form,
        userId: user.uid
      });
      alert("Organismo guardado correctamente");
      setForm({
        provincia: "",
        denominacion: "",
        denominacion_simplificada: "",
        tipo_oficina: "",
        gestiona_procesos: ""
      });
      if (onSaved) onSaved();
    } catch (error) {
      console.error("Error al guardar el organismo: ", error);
      alert("Hubo un error al guardar");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl bg-white p-10 rounded-lg shadow-xl space-y-6"
      >
        <h2 className="text-4xl font-extrabold text-blue-900 text-center mb-10">
          Formulario de Organismo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provincia *</label>
            <select
              name="provincia"
              value={form.provincia}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar provincia</option>
              {provincias.map((prov) => (
                <option key={prov} value={prov}>{prov}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de oficina *</label>
            <select
              name="tipo_oficina"
              value={form.tipo_oficina}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar tipo</option>
              {tiposOficina.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Denominación *</label>
            <input
              name="denominacion"
              value={form.denominacion}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Denominación Simplificada</label>
            <input
              name="denominacion_simplificada"
              value={form.denominacion_simplificada}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Gestiona procesos</label>
            <select
              name="gestiona_procesos"
              value={form.gestiona_procesos}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar</option>
              {opcionesGestion.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition text-sm"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
