import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from './firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MenuPage from './components/MenuPage';
import ListaOrganismosForm from './components/ListaOrganismosForm';
import GestionOrganismosForm from './components/GestionOrganismosForm';
import { Button } from './components/ui/button';
import { useNavigate } from 'react-router-dom';
import { UserProvider } from './components/UserContext';
import ReportesPage from './components/ReportesPage';
import VolverAlMenu from './components/VolverAlMenu';

function App() {
  const [user, loading, error] = useAuthState(auth);
  const [isAuthorized, setIsAuthorized] = useState(false);  // Estado de autorización
  const [roles, setRoles] = useState([]);  // Para almacenar los roles del usuario
  const [isAdmin, setIsAdmin] = useState(false); // Estado que indica si el usuario es admin
  const [isVerifying, setIsVerifying] = useState(true); // Estado para mostrar que se está verificando la autenticación
  const navigate = useNavigate();

  // Verificar si el usuario existe en la base de datos de usuarios
  const verificarUsuario = async (user, navigate) => {
    setIsVerifying(true); // Mientras verificamos, no renderizamos la app

    const userRef = doc(db, "users", user.email);  // Usamos el email como ID del documento
    const docSnap = await getDoc(userRef);

    if (!docSnap.exists()) {
      // Si el usuario no existe en la base de datos, cerramos la sesión
      console.log('Usuario no encontrado en la base de datos, cerrando sesión...');
      setIsAuthorized(false);  // Cambiar el estado de autorización a false
      signOut(auth);  // Cerrar la sesión del usuario
      alert('Usuario inexistente. Solicite acceso por correo a forojufejus@gmail.com');
    } else {
      // Si el usuario está en la base de datos
      console.log('Usuario encontrado y autorizado');
      const userData = docSnap.data();

      // Establecer los roles en el estado
      setRoles(userData.rol || []); // Asegúrate de que el campo `rol` exista

      // Comprobar si el usuario es administrador
      if (userData.rol && userData.rol.includes('admin')) {
        setIsAdmin(true);  // Usuario es admin
        setIsAuthorized(true);  // Usuario autorizado
      } else {
        setIsAdmin(false); // Usuario no admin
        setIsAuthorized(true); // Usuario autorizado, pero no admin
      }

      // Copiar los datos proporcionados por Google a Firestore si es necesario
      await copiarDatosDeGoogleAFirestore(user);

      navigate('/'); // Redirigir a la página principal
    }

    setIsVerifying(false); // Terminamos la verificación
  };

  // Función para copiar los datos de Google a Firestore
  const copiarDatosDeGoogleAFirestore = async (user) => {
    const userRef = doc(db, "users", user.email); // Usamos el email como ID del documento

    // Obtenemos los datos actuales del usuario para verificar los roles existentes
    const userDoc = await getDoc(userRef);
    let userData = {};

    if (userDoc.exists()) {
      // Si el documento ya existe, recuperamos los datos y mantenemos los roles actuales
      userData = userDoc.data();
      // Si ya existe el campo 'rol' y es un array, mantenemos los roles y agregamos el nuevo si no está presente
      if (userData.rol && Array.isArray(userData.rol)) {
        if (!userData.rol.includes('usuario_normal')) {
          userData.rol.push('usuario_normal');  // Agregamos el rol 'usuario_normal' solo si no está presente
        }
      } else {
        // Si no existe el campo 'rol', creamos un array con el rol por defecto
        userData.rol = ['usuario_normal'];
      }
    } else {
      // Si el documento no existe, lo creamos desde cero
      userData = {
        displayName: user.displayName,
        email: user.email,
        emailVerified: user.emailVerified,
        photoURL: user.photoURL,
        createdAt: new Date().toISOString(),
        lastSignInTime: user.metadata.lastSignInTime,
        createdAtGoogle: user.metadata.creationTime,
        rol: ['usuario_normal'], // Rol por defecto al crear el usuario
      };
    }

    // Guardamos o actualizamos los datos del usuario sin sobrescribir completamente los datos existentes
    await setDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      createdAt: userData.createdAt || new Date().toISOString(),
      lastSignInTime: user.metadata.lastSignInTime,
      createdAtGoogle: user.metadata.creationTime,
      rol: userData.rol || ['usuario_normal'],
    }, { merge: true });
    
    console.log('Datos de Google copiados a Firestore, con rol(s):', userData.rol);
  };

  // Manejo de inicio de sesión
  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then(result => {
        const user = result.user;
        verificarUsuario(user, navigate);  // Verifica si el usuario está registrado en la base de datos después de la autenticación
      })
      .catch(err => {
        console.error('Error al iniciar sesión:', err);
      });
  };

  // Efecto para verificar al usuario cada vez que se autentica
  useEffect(() => {
    if (user) {
      verificarUsuario(user, navigate); // Verifica si el email del usuario existe en la base de datos
    } else {
      setIsVerifying(false);  // Si no hay usuario, terminamos la verificación
    }
  }, [user]);

  if (loading || isVerifying) return <p className="p-6">Cargando...</p>;  // Evita renderizar mientras verificamos
  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Solo mostramos contenido si el usuario está autenticado y autorizado */}
      {user && isAuthorized ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-blue-800">JUFEJUS - Observatorio Federal de Oficinas Judiciales</h1>

            <div className="flex items-center gap-4">
              <VolverAlMenu />
              <Button
                onClick={() => {
                  signOut(auth);
                  navigate('/');
                }}
              >
                Cerrar sesión
              </Button>
            </div>
          </div>

          <UserProvider>
            <Routes>
              <Route path="/" element={<MenuPage isAdmin={isAdmin} />} />
              <Route path="/organismos" element={<ListaOrganismosForm user={user} />} />
              <Route path="/reportes" element={<ReportesPage />} />
              {/* Solo el admin puede ver el formulario de gestión */}
              {isAdmin && <Route path="/gestion" element={<GestionOrganismosForm user={user} />} />}
            </Routes>
          </UserProvider>
        </>
      ) : (
        <div className="text-center mt-20">
           <div className="flex justify-center mb-6 space-x-8">
            <img src="/jufejus.jpg" alt="Logo JUFEJUS" className="w-32 h-32" />
            <img src="/foro_oficinas.jpg" alt="Logo Foro Oficinas Judiciales" className="w-32 h-32" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-800 mb-4">
            <p>Observatorio de Oficinas Judiciales</p>
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
