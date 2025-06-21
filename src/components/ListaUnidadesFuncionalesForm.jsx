import React, { useEffect, useState, useRef } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import DetalleOrganismoForm from './DetalleOrganismoForm';

export default function ListaUnidadesFuncionalesForm({ organismoId, onVolver }) {
  const [unidades, setUnidades] = useState([]);
  const [nuevaUF, setNuevaUF] = useState({
    denominacion: '',
    localidad: '',
    anio_implementacion: '',
    domicilio: '',
    jueces_asistidos: ''
  });
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormularioOrg, setMostrarFormularioOrg] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    console.log("ID del organismo actual:", organismoId); // 👈 Agregá es
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
      setNuevaUF({ denominacion: '', localidad: '', anio_implementacion: '', domicilio: '', jueces_asistidos: '' });
      setEditandoId(null);
    }
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

    setNuevaUF({ denominacion: '', localidad: '', anio_implementacion: '', domicilio: '', jueces_asistidos: '' });
    setEditandoId(null);
  };

  if (mostrarFormularioOrg) {
    return <DetalleOrganismoForm organismoId={organismoId} onVolver={() => setMostrarFormularioOrg(false)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Unidades Funcionales</h2>
        <Button variant="outline" onClick={() => setMostrarFormularioOrg(true)}>Detalles...</Button>
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
        <Button type="submit">
          {editandoId ? 'Guardar Cambios' : 'Agregar Unidad Funcional'}
        </Button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {unidades.length === 0 ? (
          <p className="text-sm text-gray-500 text-center col-span-full">
            No hay unidades funcionales registradas.
          </p>
        ) : (
          unidades.map(uf => (
            <Card key={uf.id} className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-base text-blue-700 cursor-pointer" onClick={() => handleSelectUF(uf)}>
                  {uf.denominacion}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">
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

      {onVolver && (
        <div className="pt-6">
          <Button variant="secondary" onClick={onVolver}>Volver</Button>
        </div>
      )}
    </div>
  );
}
