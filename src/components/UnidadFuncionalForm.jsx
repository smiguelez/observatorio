import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';
import OrganismoForm from './ListaUnidadesFuncionalesForm';

export default function UnidadFuncionalForm({
  organismoId,
  localidades,
  editandoUF,
  onUnidadFuncionalGuardada,
  onCancelarEdicion
}) {
  const [nuevaUF, setNuevaUF] = useState({
    denominacion_unidad: '',
    localidad_id: '',
    tipo_uf: '',
    anio_implementacion: '',
    domicilio: '',
    jueces_asistidos: '',
    telefono: '',
    mail: '',
    responsable: '',
    codigo_postal: ''
  });

  const formRef = useRef(null);

  useEffect(() => {
    if (editandoUF) {
      // Si es creación, editandoUF es un objeto vacío {}
      setNuevaUF({
        denominacion_unidad: editandoUF.denominacion_unidad || '',
        localidad_id: editandoUF.localidad_id || '',
        tipo_uf: editandoUF.tipo_uf || '',
        anio_implementacion: editandoUF.anio_implementacion || '',
        domicilio: editandoUF.domicilio || '',
        jueces_asistidos: editandoUF.jueces_asistidos || '',
        telefono: editandoUF.telefono || '',
        mail: editandoUF.mail || '',
        responsable: editandoUF.responsable || '',
        codigo_postal: editandoUF.codigo_postal || ''
      });

      // Scroll al formulario al iniciar edición/creación
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [editandoUF]);

  const handleChange = (e) => {
    setNuevaUF({ ...nuevaUF, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!nuevaUF.denominacion_unidad || !nuevaUF.localidad_id) {
      alert("Por favor, completá los campos obligatorios.");
      return;
    }

    try {
      if (editandoUF && editandoUF.id) {
        // Modo edición
        const ref = doc(
          db,
          `organismos/${organismoId}/unidades_funcionales/${editandoUF.id}`
        );
        await updateDoc(ref, nuevaUF);
        console.log("✅ UF actualizada:", nuevaUF);
      } else {
        // Modo creación
        await addDoc(
          collection(db, `organismos/${organismoId}/unidades_funcionales`),
          nuevaUF
        );
        console.log("✅ UF agregada:", nuevaUF);
      }

      await actualizarActualizadoA();

      if (typeof onUnidadFuncionalGuardada === 'function') {
        onUnidadFuncionalGuardada();
      }

      // Cierra el formulario
      if (typeof onCancelarEdicion === 'function') {
        onCancelarEdicion();
      }

    } catch (error) {
      console.error("❌ Error guardando UF:", error);
      alert(`Error guardando la unidad funcional: ${error.message}`);
    }
  };

  const actualizarActualizadoA = async () => {
    try {
      const organismoRef = doc(db, 'organismos', organismoId);
      await updateDoc(organismoRef, {
        actualizado_a: serverTimestamp()
      });

      console.log('✅ Timestamp actualizado correctamente.');

      const organismoSnap = await getDoc(organismoRef);
      if (organismoSnap.exists()) {
        console.log('✅ Valor de actualizado_a:', organismoSnap.data().actualizado_a);
      } else {
        console.log("⚠ El documento del organismo no existe.");
      }
    } catch (error) {
      console.error("❌ Error actualizando timestamp:", error);
      alert(`Error actualizando timestamp: ${error.message}`);
    }
  };

  if (!editandoUF) {
    // ⚠ No mostrar nada si no se está editando o creando
    return null;
  }

  return (
    <div ref={formRef} className="space-y-6 mt-8 border-t pt-6">
      <h2 className="text-xl font-semibold text-gray-800">
        {editandoUF.id
          ? 'Editar Unidad Funcional'
          : 'Agregar Nueva Unidad Funcional'}
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="denominacion_unidad" className="block text-sm font-medium text-gray-700">
              Denominación de la Unidad Funcional:
            </label>
            <Input
              id="denominacion_unidad"
              name="denominacion_unidad"
              value={nuevaUF.denominacion_unidad}
              onChange={handleChange}
              placeholder="Denominación"
            />
          </div>

          <div>
            <label htmlFor="localidad_id" className="block text-sm font-medium text-gray-700">
              Localidad:
            </label>
            <select
              id="localidad_id"
              name="localidad_id"
              value={nuevaUF.localidad_id}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded text-sm"
            >
              <option value="">Seleccionar Localidad</option>
              {localidades?.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.nombre} ({loc.provincia})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="anio_implementacion" className="block text-sm font-medium text-gray-700">
              Año de Implementación:
            </label>
            <Input
              id="anio_implementacion"
              name="anio_implementacion"
              value={nuevaUF.anio_implementacion}
              onChange={handleChange}
              placeholder="Año de Implementación"
            />
          </div>

          <div>
            <label htmlFor="domicilio" className="block text-sm font-medium text-gray-700">
              Domicilio:
            </label>
            <Input
              id="domicilio"
              name="domicilio"
              value={nuevaUF.domicilio}
              onChange={handleChange}
              placeholder="Domicilio"
            />
          </div>

          <div>
            <label htmlFor="jueces_asistidos" className="block text-sm font-medium text-gray-700">
              Jueces Asistidos:
            </label>
            <Input
              id="jueces_asistidos"
              name="jueces_asistidos"
              value={nuevaUF.jueces_asistidos}
              onChange={handleChange}
              placeholder="Jueces Asistidos"
            />
          </div>

          <div>
            <label htmlFor="tipo_uf" className="block text-sm font-medium text-gray-700">
              Tipo de Unidad Funcional:
            </label>
            <select
              id="tipo_uf"
              name="tipo_uf"
              value={nuevaUF.tipo_uf}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded text-sm"
            >
              <option value="">Seleccionar Tipo de UF</option>
              <option value="Delegación">Delegación</option>
              <option value="Subdelegación">Subdelegación</option>
            </select>
          </div>

          <div>
            <label htmlFor="telefono" className="block text-sm font-medium text-gray-700">
              Teléfono:
            </label>
            <Input
              id="telefono"
              name="telefono"
              value={nuevaUF.telefono}
              onChange={handleChange}
              placeholder="Teléfono"
            />
          </div>

          <div>
            <label htmlFor="mail" className="block text-sm font-medium text-gray-700">
              Correo Electrónico:
            </label>
            <Input
              id="mail"
              name="mail"
              value={nuevaUF.mail}
              onChange={handleChange}
              placeholder="Correo Electrónico"
            />
          </div>

          <div>
            <label htmlFor="responsable" className="block text-sm font-medium text-gray-700">
              Nombre del Responsable:
            </label>
            <Input
              id="responsable"
              name="responsable"
              value={nuevaUF.responsable}
              onChange={handleChange}
              placeholder="Nombre del Responsable"
            />
          </div>

          <div>
            <label htmlFor="codigo_postal" className="block text-sm font-medium text-gray-700">
              Código Postal:
            </label>
            <Input
              id="codigo_postal"
              name="codigo_postal"
              value={nuevaUF.codigo_postal}
              onChange={handleChange}
              placeholder="Código Postal"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Button type="submit">
            {editandoUF.id ? 'Guardar Cambios' : 'Agregar Unidad Funcional'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancelarEdicion}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
