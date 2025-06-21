import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import ListaUnidadesFuncionalesForm from './ListaUnidadesFuncionalesForm';
import DetalleOrganismoForm from './DetalleOrganismoForm';
import { Building2 } from 'lucide-react';

const coloresTipoOficina = {
  'OFICINA JUDICIAL': 'bg-yellow-100 text-yellow-800',
  'COORDINACIÓN': 'bg-purple-100 text-purple-800',
  'OFICINA JUDICIAL ESPECIALIZADA': 'bg-pink-100 text-pink-800',
  'UNIDAD OPERATIVA': 'bg-indigo-100 text-indigo-800',
};

const coloresFuero = {
  'PENAL': 'bg-red-100 text-red-800',
  'CIVIL': 'bg-green-100 text-green-800',
  'FAMILIA': 'bg-blue-100 text-blue-800',
  'LABORAL': 'bg-orange-100 text-orange-800',
};

export default function ListaOrganismosForm() {
  const [organismos, setOrganismos] = useState([]);
  const [organismoSeleccionado, setOrganismoSeleccionado] = useState(null);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  useEffect(() => {
    const fetchOrganismos = async () => {
      const snapshot = await getDocs(collection(db, 'organismos'));
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrganismos(lista);
    };
    fetchOrganismos();
  }, []);

  if (mostrarDetalle && organismoSeleccionado) {
    return (
      <DetalleOrganismoForm
        organismoId={organismoSeleccionado}
        onVolver={() => setMostrarDetalle(false)}
      />
    );
  }

  if (organismoSeleccionado) {
    return (
      <ListaUnidadesFuncionalesForm
        organismoId={organismoSeleccionado}
        onVolver={() => setOrganismoSeleccionado(null)}
      />
    );
  }

  return (

    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-blue-800">
        <p>Observatorio de Oficinas Judiciales JUFEJUS</p>
        <p className="text-lg font-medium text-gray-700">Mis Organismos Informados</p>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {organismos.length === 0 ? (
          <p className="text-sm text-gray-500 text-center col-span-full">
            No hay organismos registrados.
          </p>
        ) : (
          organismos.map(org => (
            <Card key={org.id} className="border border-gray-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-800" />
                <span className="text-base font-semibold text-blue-700">{org.denominacion}</span>
              </div>
            </CardHeader>
              <CardContent className="text-sm text-gray-700 space-y-2">
                <div className="flex gap-2">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                  coloresTipoOficina[(org.tipo_oficina || '').toUpperCase().trim()] || 'bg-gray-200 text-gray-800'
                }`}
                    title="Tipo de Oficina"
                  >
                      {org.tipo_oficina || '—'}
                    </span>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    coloresFuero[(org.fuero_simplificado || '').toUpperCase().trim()] || 'bg-gray-200 text-gray-800'
                  }`}
                  title="Fuero"
                >
                  {org.fuero_simplificado || '—'}
                </span>
                </div>
                <div className="pt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOrganismoSeleccionado(org.id)}>
                    Unidades Funcionales
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setOrganismoSeleccionado(org.id);
                    setMostrarDetalle(true);
                  }}>
                    Detalles...
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
