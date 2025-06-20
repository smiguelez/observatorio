import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function OrganismoList({ user, refreshFlag }) {
  const [organismos, setOrganismos] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const q = query(
        collection(db, "organismos"),
        where("usuario_google", "==", user.email)
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setOrganismos(data);
    };

    fetchData();
  }, [user, refreshFlag]); // ← Actualiza cuando cambie `refreshFlag`

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">Listado de Organismos</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
          <thead className="bg-blue-100">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Provincia</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Denominación</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Tipo de Oficina</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Gestiona Procesos</th>
            </tr>
          </thead>
          <tbody>
            {organismos.map((org) => (
              <tr key={org.id} className="border-t">
                <td className="px-4 py-2 text-sm">{org.provincia}</td>
                <td className="px-4 py-2 text-sm">{org.denominacion}</td>
                <td className="px-4 py-2 text-sm">{org.tipo_oficina}</td>
                <td className="px-4 py-2 text-sm">{org.gestiona_procesos}</td>
              </tr>
            ))}
            {organismos.length === 0 && (
              <tr>
                <td colSpan="4" className="text-center py-4 text-gray-500">No hay organismos cargados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
