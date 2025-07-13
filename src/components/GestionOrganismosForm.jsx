import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function OrganismosFormulario() {
  const [organismosPorUsuario, setOrganismosPorUsuario] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrganismos = async () => {
      try {
        const organismosSnapshot = await getDocs(collection(db, 'organismos'));
        const organismos = organismosSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Agrupar organismos por usuario
        const organismosAgrupados = organismos.reduce((acc, organismo) => {
          const usuario = organismo.usuario_google || 'Sin usuario';
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
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Organismos Agrupados por Usuario
      </h2>

      {Object.entries(organismosPorUsuario).map(([usuario, organismos]) => (
        <div key={usuario} className="border-t pt-4">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">
            Usuario: {usuario}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {organismos.map((organismo) => (
              <div
                key={organismo.id}
                className="border p-4 rounded-lg shadow-sm bg-blue-100"
              >
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    <strong>Provincia:</strong>{' '}
                    {organismo.provincia || '—'}
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    <strong>Denominación:</strong>{' '}
                    {organismo.denominacion || '—'}
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    <strong>Fecha Última Modificación:</strong>{' '}
                    {organismo.actualizado_a
                      ? formatTimestamp(organismo.actualizado_a)
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

/**
 * Devuelve una fecha legible a partir de:
 * - Firestore Timestamp
 * - objeto { seconds }
 * - String ISO
 */
function formatTimestamp(ts) {
  try {
    if (typeof ts?.toDate === 'function') {
      return ts.toDate().toLocaleString();
    } else if (typeof ts?.seconds === 'number') {
      return new Date(ts.seconds * 1000).toLocaleString();
    } else if (typeof ts === 'string') {
      return new Date(ts).toLocaleString();
    }
    return '—';
  } catch (e) {
    console.error('Error formateando timestamp', e);
    return '—';
  }
}
