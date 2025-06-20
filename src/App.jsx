import { useEffect, useState } from "react";
import { auth, provider, signInWithPopup, signOut } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

import OrganismoForm from "./components/OrganismoForm";
import OrganismoList from "./components/OrganismoList";

function App() {
  const [user, setUser] = useState(null);
  const [refreshList, setRefreshList] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userRef);

      if (!docSnap.exists()) {
        await setDoc(userRef, {
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const handleSaved = () => {
    setRefreshList((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white text-gray-800 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-900 text-center md:text-left">
            Observatorio de Oficinas Judiciales JUFEJUS
          </h1>
          <div className="mt-4 md:mt-0">
            {user ? (
              <div className="text-right">
                <p className="text-sm mb-1">Hola, {user.displayName}</p>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded"
                >
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded"
              >
                Iniciar sesión con Google
              </button>
            )}
          </div>
        </header>

        {user ? (
          <div className="space-y-10">
            <OrganismoForm user={user} onSaved={handleSaved} />
            <hr className="border-gray-300" />
            <OrganismoList user={user} refreshFlag={refreshList} />
          </div>
        ) : (
          <p className="text-center text-lg text-gray-600 mt-20">
            Por favor iniciá sesión para acceder al sistema.
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
