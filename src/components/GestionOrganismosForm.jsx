import React, { useEffect, useState } from 'react';
import { db } from '../firebase'; // Asegúrate de que esté correctamente configurado el acceso a Firebase
import { collection, getDocs } from 'firebase/firestore';

export default function OrganismosFormulario() {
  const [organismosPorUsuario, setOrganismosPorUsuario] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrganismos = async () => {
      try {
        // Recuperar todos los organismos
        const organismosSnapshot = await getDocs(collection(db, 'organismos'));
        const organismos = organismosSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Agrupar organismos por usuario
        const organismosAgrupados = organismos.reduce((acc, organismo) => {
          const usuario = organismo.usuario_google; // Asumimos que cada organismo tiene un campo 'usuario_google'
          if (!acc[usuario]) {
            acc[usuario] = [];
          }
          acc[usuario].push(organismo);
          return acc;
        }, {});

        setOrganismosPorUsuario(organismosAgrupados);
        setLoading(false);
      } catch (error) {
        console.error('Error al obtener organismos:', error);
        setLoading(false);
      }
    };

    fetchOrganismos();
  }, []);

  if (loading) {
    return <div>Cargando organismos...</div>;
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Organismos Agrupados por Usuario</h2>

      {Object.entries(organismosPorUsuario).map(([usuario, organismos]) => (
        <div key={usuario} className="border-t pt-4">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Usuario: {usuario}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {organismos.map((organismo) => (
              <div
                key={organismo.id}
                className="border p-4 rounded-lg shadow-sm bg-blue-100" // Fondo azul clarito en la tarjeta
              >
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    <strong>Provincia:</strong> {organismo.provincia || '—'}
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    <strong>Nombre Organismo:</strong> {organismo.denominacion || '—'}
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    <strong>Fecha Última Modificación:</strong>{' '}
                    {organismo.fecha_ultima_modificacion
                      ? new Date(organismo.fecha_ultima_modificacion.seconds * 1000).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
