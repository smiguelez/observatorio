// src/App.jsx
import { useEffect, useState } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup } from "firebase/auth";



function App() {
  const [user, setUser] = useState(null);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
    } catch (err) {
      console.error("Error en login:", err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 text-center">
      {user ? (
        <>
          <h1 className="text-2xl font-bold">Bienvenido, {user.displayName}</h1>
          <p className="text-sm text-gray-600">{user.email}</p>
        </>
      ) : (
        <>
          console.log("API Key cargada:", import.meta.env.VITE_FIREBASE_API_KEY);
          <h1 className="text-3xl font-bold mb-4">Observatorio</h1>
          <button
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            onClick={handleLogin}
          >
            Iniciar sesión con Google
          </button>
        </>
      )}
    </div>
  );
}

export default App;
