import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Input } from './ui/input';
import { Button } from './ui/button';

export default function DetalleOrganismoForm({ organismoId, onVolver }) {
  const [organismo, setOrganismo] = useState({
    nombre: '',
    localidad: '',
    tipo_oficina: '',
    gestiona_procesos: '',
    domicilio: '',
    jueces_asistidos: '',
    anio_implementacion: ''
  });

  useEffect(() => {
    const fetchOrganismo = async () => {
      const ref = doc(db, 'organismos', organismoId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setOrganismo({ ...snap.data() });
      }
    };
    if (organismoId) {
      fetchOrganismo();
    }
  }, [organismoId]);

  const handleChange = (e) => {
    setOrganismo({ ...organismo, [e.target.name]: e.target.value });
  };

  const handleGuardar = async () => {
    const ref = doc(db, 'organismos', organismoId);
    await updateDoc(ref, organismo);
    onVolver(); // volver a la lista
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-800">Detalle del Organismo</h2>
      <Input name="nombre" value={organismo.nombre} onChange={handleChange} placeholder="Nombre" />
      <Input name="localidad" value={organismo.localidad} onChange={handleChange} placeholder="Localidad" />
      <Input name="tipo_oficina" value={organismo.tipo_oficina} onChange={handleChange} placeholder="Tipo de Oficina" />
      <Input name="gestiona_procesos" value={organismo.gestiona_procesos} onChange={handleChange} placeholder="Gestiona Procesos" />
      <Input name="domicilio" value={organismo.domicilio || ''} onChange={handleChange} placeholder="Domicilio" />
      <Input name="jueces_asistidos" value={organismo.jueces_asistidos || ''} onChange={handleChange} placeholder="Jueces Asistidos" />
      <Input name="anio_implementacion" value={organismo.anio_implementacion || ''} onChange={handleChange} placeholder="Año de Implementación" />
      <div className="flex gap-2 mt-4">
        <Button onClick={handleGuardar}>Guardar Cambios</Button>
        <Button variant="outline" onClick={onVolver}>Volver</Button>
      </div>
    </div>
  );
}
