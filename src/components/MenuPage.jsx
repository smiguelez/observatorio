import React from 'react';
import { Link } from 'react-router-dom';
import { useUser } from './UserContext';

export default function MenuPage({ isAdmin }) {

  const user = useUser();

  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-6">
      <h1 className="text-3xl font-bold text-blue-800">Hola, {user ? user.displayName : 'Invitado'}</h1>
      <p className="text-lg text-gray-700">Selecciona una opción:</p>
      <Link
        to="/organismos"
        className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
      >
        Mis Organismos
      </Link>

      <Link
        to="/reportes"
        className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
      >
        Reporte PowerBI
      </Link>

      {/* Mostrar el botón "Gestiona Organismos" solo si el usuario es admin */}
      {isAdmin && (
        <Link
          to="/gestion"
          className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
        >
          Gestiona Organismos
        </Link>
      )}

    </div>
  );
}
