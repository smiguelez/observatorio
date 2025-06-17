import { auth, provider, db } from "../services/firebase";
import { signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function LoginButton() {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: new Date()
        });
        console.log("Usuario creado en Firestore");
      }
    } catch (error) {
      console.error("Error de login:", error);
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
    >
      Iniciar sesión con Google
    </button>
  );
}
