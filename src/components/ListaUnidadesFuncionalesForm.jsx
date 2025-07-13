import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { collection, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import UnidadFuncionalForm from './UnidadFuncionalForm';

export default function ListaUnidadesFuncionalesForm({ organismoId, onVolver }) {
  const [unidades, setUnidades] = useState([]);
  const [organismo, setOrganismo] = useState(null);
  const [localidades, setLocalidades] = useState([]);
  const [editandoUF, setEditandoUF] = useState(null);

  const fetchDatos = async () => {
    if (!organismoId) return;

    const docRef = doc(db, 'organismos', organismoId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const org = { id: docSnap.id, ...docSnap.data() };
    setOrganismo(org);

    const ufSnap = await getDocs(collection(db, `organismos/${organismoId}/unidades_funcionales`));
    const listaUF = ufSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setUnidades(listaUF);

    const locSnap = await getDocs(collection(db, 'localidades'));
    const listaLoc = locSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(loc => loc.provincia === org.provincia)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    setLocalidades(listaLoc);
  };

  useEffect(() => {
    fetchDatos();
  }, [organismoId]);

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, `organismos/${organismoId}/unidades_funcionales/${id}`));
    fetchDatos();
  };

  const getNombreLocalidad = (id) => {
    const loc = localidades.find((l) => l.id === id);
    return loc ? `${loc.nombre} (${loc.provincia})` : '—';
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <p className="text-2xl font-bold text-gray-800 mb-1">
          Provincia: <span className="font-semibold">{organismo?.provincia || '—'}</span>
        </p>
        <h2 className="text-2xl font-bold text-gray-800 mb-1">
          Organismo: <span className="font-semibold">{organismo?.denominacion || '—'}</span>
        </h2>
        <h3 className="text-xl font-semibold text-gray-700">Unidades Funcionales</h3>
      </div>

      {/* Botón Agregar */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => setEditandoUF({})}
        >
          + Agregar Nueva Unidad Funcional
        </Button>
      </div>

      {/* Grid de tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {unidades.length === 0 ? (
          <p className="text-sm text-gray-500 text-center col-span-full">
            No hay unidades funcionales registradas.
          </p>
        ) : (
          unidades.map((uf) => (
            <Card 
              key={uf.id}
              className="border p-4 bg-blue-100"
            >
              <CardHeader>
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => setEditandoUF(uf)}
                >
                  <Building2 className="w-5 h-5 text-blue-700" />
                  <span className="text-lg font-bold text-blue-700">
                    {getNombreLocalidad(uf.localidad_id)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">
                Denominación: <strong>{uf.denominacion_unidad || '—'}</strong><br />
                Tipo de Unidad Funcional: {uf.tipo_uf || '-'}<br />
                Año de implementación: {uf.anio_implementacion || '—'}<br />
                Jueces asistidos: {uf.jueces_asistidos || '—'}<br />
                Responsable: {uf.responsable || '—'}<br />
                Correo: {uf.mail || '—'}<br />
                Teléfono: {uf.telefono || '—'}<br />
                Domicilio: {uf.domicilio || '—'}<br />
                Código Postal: {uf.codigo_postal || '—'}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditandoUF(uf)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(uf.id)}
                  >
                    Borrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Formulario, solo si se está editando o creando */}
      {editandoUF && (
        <UnidadFuncionalForm
          organismoId={organismoId}
          localidades={localidades}
          editandoUF={editandoUF}
          onUnidadFuncionalGuardada={fetchDatos}
          onCancelarEdicion={() => setEditandoUF(null)}
        />
      )}
    </div>
  );
}
