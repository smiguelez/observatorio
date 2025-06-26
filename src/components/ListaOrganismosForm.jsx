import React, { useEffect, useState } from 'react';
import { query, collection, getDocs, where } from 'firebase/firestore'; // 👈 faltaba importar "where"
import { db } from '../firebase';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Building2 } from 'lucide-react';
import OrganismoDetailTabs from './OrganismoDetailTabs';

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

export default function ListaOrganismosForm({ user }) {
  const [organismos, setOrganismos] = useState([]);
  const [unidadesPorOrganismo, setUnidadesPorOrganismo] = useState({});
  const [organismoSeleccionado, setOrganismoSeleccionado] = useState(null);

  useEffect(() => {
    const fetchOrganismos = async () => {
      if (!user || !user.email) return;

      try {
        const q = query(
          collection(db, 'organismos'),
          where('usuario_google', '==', user.email)
        );

        const snapshot = await getDocs(q);
        const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setOrganismos(lista);
        fetchUnidadesPorOrganismo(lista);
        fetchTaxonomiaPorOrganismo(lista);
      } catch (error) {
        console.error('Error obteniendo organismos:', error);
      }
    };

    fetchOrganismos();
  }, [user]);

  const fetchUnidadesPorOrganismo = async (organismos) => {
    const cantidades = {};
    await Promise.all(
      organismos.map(async (org) => {
        try {
          const ref = collection(db, `organismos/${org.id}/unidades_funcionales`);
          const snapshot = await getDocs(ref);
          cantidades[org.id] = snapshot.size;
        } catch (error) {
          console.error(`Error al obtener UF de organismo ${org.id}:`, error);
          cantidades[org.id] = 0;
        }
      })
    );
    setUnidadesPorOrganismo(cantidades);
  };

  const fetchTaxonomiaPorOrganismo = async (organismos) => {
    const nuevosOrganismos = await Promise.all(
      organismos.map(async (org) => {
        try {
          const ref = collection(db, `organismos/${org.id}/taxonomia`);
          const snapshot = await getDocs(ref);
          const taxonomia = {};
          snapshot.docs.forEach(doc => {
            taxonomia[doc.id] = doc.data();
          });
          return { ...org, taxonomia };
        } catch (error) {
          console.error(`Error al obtener taxonomía de ${org.id}:`, error);
          return { ...org, taxonomia: {} };
        }
      })
    );
    setOrganismos(nuevosOrganismos);
  };

  if (organismoSeleccionado) {
    return (
      <OrganismoDetailTabs
        organismo={organismoSeleccionado}
        
        setOrganismo={(nuevo) => {
          setOrganismos(prev => prev.map(o => o.id === nuevo.id ? nuevo : o));
          setOrganismoSeleccionado(nuevo); // ✅ esto es fundamental para forzar el re-render del formulario
        }}

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
            <Card key={org.id} className="relative border border-gray-200">
              <CardHeader className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-800" />
                  <span className="text-base font-semibold text-blue-700">
                    {org.denominacion}
                  </span>
                </div>
                <div className="text-sm font-semibold text-blue-700">
                  Unidades Funcionales: {unidadesPorOrganismo[org.id] ?? '—'}
                </div>
              </CardHeader>
              <CardContent className="text-sm text-gray-700 space-y-2">
                <div className="flex gap-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    coloresTipoOficina[(org.tipo_oficina || '').toUpperCase().trim()] || 'bg-gray-200 text-gray-800'
                  }`}>
                    {org.tipo_oficina || '—'}
                  </span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    coloresFuero[(org.fuero_simplificado || '').toUpperCase().trim()] || 'bg-gray-200 text-gray-800'
                  }`}>
                    {org.fuero_simplificado || '—'}
                  </span>
                </div>
                <div className="pt-2">
                  <Button size="sm" variant="outline" onClick={() => setOrganismoSeleccionado(org)}>
                    Ver detalle
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
