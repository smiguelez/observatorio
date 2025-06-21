import React from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import ListaOrganismosForm from './components/ListaOrganismosForm'; // Asegurate de importar correctamente
import { Button } from './components/ui/button';

function App() {
  const [user, loading, error] = useAuthState(auth);

  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(err => {
      console.error('Error al iniciar sesión:', err);
    });
  };

  if (loading) return <p className="p-6">Cargando...</p>;
  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {user ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-blue-800">Observatorio Federal de Oficinas Judiciales</h1>
            <Button onClick={() => auth.signOut()}>Cerrar sesión</Button>
          </div>
          <ListaOrganismosForm user={user} />
        </>
      ) : (
        <div className="text-center mt-20">
          <h1 className="text-2xl font-semibold text-gray-800 mb-4">
            <p> Observatorio de Oficinas Judiciales </p>
            <p>JUFEJUS</p>
            <p>¡Bienvenid@s!</p>
          </h1>
          <Button onClick={handleLogin}>Iniciar sesión con Google</Button>
        </div>
      )}
    </div>
  );
}

export default App;
