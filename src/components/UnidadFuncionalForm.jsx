import React, { useEffect, useState, useRef } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import OrganismoForm from './ListaUnidadesFuncionalesForm';

export default function UnidadFuncionalForm({ organismoId }) {
  const [unidades, setUnidades] = useState([]);
  const [nuevaUF, setNuevaUF] = useState({
    denominacion: '',
    tipo_uf: '',
    localidad: '',
    anio_implementacion: '',
    domicilio: '',
    jueces_asistidos: ''
  });
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormularioOrg, setMostrarFormularioOrg] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    const fetchUF = async () => {
      const ref = collection(db, `organismos/${organismoId}/unidades_funcionales`);
      const snapshot = await getDocs(ref);
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUnidades(lista);
    };

    if (organismoId) {
      fetchUF();
    }
  }, [organismoId]);

  const handleChange = e => {
    setNuevaUF({ ...nuevaUF, [e.target.name]: e.target.value });
  };

  const handleSelectUF = uf => {
    setNuevaUF({
      denominacion: uf.denominacion || '',
      tipo_uf: uf.tipo_uf || '',
      localidad: uf.localidad || '',
      anio_implementacion: uf.anio_implementacion || '',
      domicilio: uf.domicilio || '',
      jueces_asistidos: uf.jueces_asistidos || ''
    });
    setEditandoId(uf.id);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDelete = async id => {
    await deleteDoc(doc(db, `organismos/${organismoId}/unidades_funcionales/${id}`));
    setUnidades(prev => prev.filter(uf => uf.id !== id));
    if (editandoId === id) {
      setNuevaUF({ denominacion: '', tipo_uf: '', localidad: '', anio_implementacion: '', domicilio: '', jueces_asistidos: '' });
      setEditandoId(null);
    }
    // Actualizar el campo 'actualizado_a' del organismo
    await actualizarActualizadoA();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!nuevaUF.denominacion || !nuevaUF.localidad) return;

    if (editandoId) {
      const ref = doc(db, `organismos/${organismoId}/unidades_funcionales/${editandoId}`);
      await updateDoc(ref, nuevaUF);
    } else {
      await addDoc(collection(db, `organismos/${organismoId}/unidades_funcionales`), nuevaUF);
    }

    const snapshot = await getDocs(collection(db, `organismos/${organismoId}/unidades_funcionales`));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setUnidades(lista);

    setNuevaUF({ denominacion: '', tipo_uf: '', localidad: '', anio_implementacion: '', domicilio: '', jueces_asistidos: '' });
    setEditandoId(null);

    // Actualizar el campo 'actualizado_a' del organismo
    await actualizarActualizadoA();
  };

  const actualizarActualizadoA = async () => {
    try {
      // Verificar si estamos dentro de la función
      console.log(`Entrando a actualizar el campo 'actualizado_a' para el organismo con ID: ${organismoId}`);

      // Obtener la referencia del organismo
      const organismoRef = doc(db, 'organismos', organismoId);

      // Verificar si la referencia es válida
      console.log(`Referencia del organismo: ${organismoRef.path}`);

      // Actualizar el campo 'actualizado_a' con la fecha y hora actual
      await updateDoc(organismoRef, {
        actualizado_a: new Date()  // Establecer la fecha y hora actual
      });

      console.log('Fecha de actualización registrada en el organismo.');
    } catch (error) {
      console.error("Error al actualizar el campo actualizado_a:", error);
    }
  };

  if (mostrarFormularioOrg) {
    return <OrganismoForm organismoId={organismoId} onVolver={() => setMostrarFormularioOrg(false)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Unidades Funcionales</h2>
        <Button variant="outline" onClick={() => setMostrarFormularioOrg(true)}>Detalles...</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {unidades.length === 0 ? (
          <p className="text-sm text-gray-500 text-center col-span-full">
            No hay unidades funcionales registradas.
          </p>
        ) : (
          unidades.map(uf => (
            <Card key={uf.id} className="border border-gray-200 bg-blue-100 p-4">
              <CardHeader>
                <CardTitle className="text-base text-blue-700 cursor-pointer" onClick={() => handleSelectUF(uf)}>
                  {uf.denominacion}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">
                Tipo de Unidad Funcional: {uf.tipo_uf || '-'}
                Localidad: {uf.localidad}<br />
                Año de implementación: {uf.anio_implementacion || '—'}<br />
                Domicilio: {uf.domicilio || '—'}<br />
                Jueces asistidos: {uf.jueces_asistidos || '—'}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleSelectUF(uf)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(uf.id)}>
                    Borrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" ref={formRef}>
        <h3 className="text-lg font-medium text-gray-800">
          {editandoId ? 'Editar Unidad Funcional' : 'Agregar Nueva Unidad Funcional'}
        </h3>
        <Input
          name="denominacion"
          placeholder="Denominación"
          value={nuevaUF.denominacion}
          onChange={handleChange}
        />
        <Input
          name="localidad"
          placeholder="Localidad"
          value={nuevaUF.localidad}
          onChange={handleChange}
        />
        <Input
          name="anio_implementacion"
          placeholder="Año de Implementación"
          value={nuevaUF.anio_implementacion}
          onChange={handleChange}
        />
        <Input
          name="domicilio"
          placeholder="Domicilio"
          value={nuevaUF.domicilio}
          onChange={handleChange}
        />
        <Input
          name="jueces_asistidos"
          placeholder="Jueces Asistidos"
          value={nuevaUF.jueces_asistidos}
          onChange={handleChange}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de UF</label>
          <select
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
        <Button type="submit">
          {editandoId ? 'Guardar Cambios' : 'Agregar Unidad Funcional'}
        </Button>
      </form>
    </div>
  );
}
