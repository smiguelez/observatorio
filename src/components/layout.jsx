import React from "react";

export default function Layout({ children, onLogout, user }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex flex-col">
      <header className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-900">
            Observatorio de Oficinas Judiciales JUFEJUS
          </h1>
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 hidden sm:inline">
                Hola, {user.displayName}
              </span>
              <button
                onClick={onLogout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

        <main className="max-w-4xl mx-auto px-4 py-10">
            <div className="bg-white rounded-xl shadow-lg p-8">
                {children}
            </div>
        </main>
    </div>
  );
}
