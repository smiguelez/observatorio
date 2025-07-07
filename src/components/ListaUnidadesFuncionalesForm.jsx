import React, { useEffect, useState, useRef } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import OrganismoForm from './OrganismoForm';

export default function ListaUnidadesFuncionalesForm({ organismoId, onVolver }) {
  const [unidades, setUnidades] = useState([]);
  const [organismo, setOrganismo] = useState(null);
  const [localidades, setLocalidades] = useState([]);
  const [nuevaUF, setNuevaUF] = useState({
    denominacion_unidad: '',
    localidad_id: '',
    tipo_uf: '', // Agregar tipo_uf aquí
    anio_implementacion: '',
    domicilio: '',
    jueces_asistidos: ''
  });
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormularioOrg, setMostrarFormularioOrg] = useState(false);
  const formRef = useRef(null);

  const resetForm = () => {
    setNuevaUF({
      denominacion_unidad: '',
      localidad_id: '',
      tipo_uf: '',  // Limpiar tipo_uf también
      anio_implementacion: '',
      domicilio: '',
      jueces_asistidos: ''
    });
    setEditandoId(null);
  };

  useEffect(() => {
    console.log('Recibido organismoId:', organismoId);

    const fetchDatos = async () => {
      if (!organismoId) return;

      const docRef = doc(db, 'organismos', organismoId);
      const docSnap = await getDoc(docRef);

      console.log('Documento organismo:', docSnap.exists(), docSnap.data());

      if (!docSnap.exists()) return;

      const org = { id: docSnap.id, ...docSnap.data() };
      setOrganismo(org);

      const ufSnap = await getDocs(collection(db, `organismos/${organismoId}/unidades_funcionales`));
      const listaUF = ufSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUnidades(listaUF);
      console.log('Unidades funcionales obtenidas:', listaUF);

      const locSnap = await getDocs(collection(db, 'localidades'));
      const listaLoc = locSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(loc => loc.provincia === org.provincia)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      setLocalidades(listaLoc);
      console.log('Localidades cargadas para esa provincia:', listaLoc);
    };

    fetchDatos();
  }, [organismoId]);

  const handleChange = e => {
    setNuevaUF({ ...nuevaUF, [e.target.name]: e.target.value });
  };

  const handleSelectUF = uf => {
    setNuevaUF({
      denominacion_unidad: uf.denominacion_unidad || '',
      localidad_id: uf.localidad_id || '',
      tipo_uf: uf.tipo_uf || '',  // Asegurarse de que tipo_uf se pase correctamente
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
      resetForm();
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!nuevaUF.denominacion_unidad || !nuevaUF.localidad_id) return;

    const ref = editandoId
      ? doc(db, `organismos/${organismoId}/unidades_funcionales/${editandoId}`)
      : collection(db, `organismos/${organismoId}/unidades_funcionales`);

    editandoId ? await updateDoc(ref, nuevaUF) : await addDoc(ref, nuevaUF);

    const snapshot = await getDocs(collection(db, `organismos/${organismoId}/unidades_funcionales`));
    const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setUnidades(lista);
    resetForm();
  };

  const getNombreLocalidad = id => {
    const loc = localidades.find(l => l.id === id);
    return loc ? `${loc.nombre} (${loc.provincia})` : '—';
  };

  return (
    <div className="space-y-6">
      {/* Mostrar listado de unidades funcionales */}
      <div>
        <p className="text-2xl font-bold text-gray-800 mb-1">
          Provincia: <span className="font-semibold">{organismo?.provincia || '—'}</span>
        </p>
        <h2 className="text-2xl font-bold text-gray-800 mb-1">
          Organismo: <span className="font-semibold">{organismo?.denominacion || '—'}</span>
        </h2>
        <h3 className="text-xl font-semibold text-gray-700">Unidades Funcionales</h3>
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
                  {uf.denominacion_unidad || '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">
                Tipo de Unidad Funcional: {uf.tipo_uf || '-'}<br />
                Localidad: {getNombreLocalidad(uf.localidad_id)}<br />
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

      {/* Formulario de edición de unidad funcional */}
      <form onSubmit={handleSubmit} className="space-y-4" ref={formRef}>
        <h3 className="text-lg font-medium text-gray-800 mt-6">
          {editandoId ? 'Editar Unidad Funcional' : 'Agregar Nueva Unidad Funcional'}
        </h3>
        <Input
          name="denominacion_unidad"
          placeholder="Denominación"
          value={nuevaUF.denominacion_unidad}
          onChange={handleChange}
        />
        <select
          name="localidad_id"
          value={nuevaUF.localidad_id}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded text-sm"
          disabled={!organismo}
        >
          <option value="">Seleccionar Localidad</option>
          {localidades.map(loc => (
            <option key={loc.id} value={loc.id}>
              {loc.nombre} ({loc.provincia})
            </option>
          ))}
        </select>
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
