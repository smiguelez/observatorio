import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth'; // Usamos Firebase Auth para gestionar la autenticación

// Creamos un contexto para el usuario
const UserContext = createContext(null);

// Componente proveedor para envolver toda la aplicación
export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);  // Guardamos el usuario logueado
      } else {
        setUser(null);  // Si no hay usuario logueado, ponemos null
      }
    });

    return () => unsubscribe(); // Limpiamos el listener cuando el componente se desmonte
  }, []);

  return (
    <UserContext.Provider value={user}>
      {children}
    </UserContext.Provider>
  );
};

// Hook para acceder al contexto de usuario desde cualquier componente
export const useUser = () => useContext(UserContext);
