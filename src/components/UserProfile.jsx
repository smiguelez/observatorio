import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";

export default function UserProfile({ user }) {
  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-xl mb-2">Bienvenido, {user.displayName}</h2>
      <img src={user.photoURL} alt="avatar" className="w-24 h-24 rounded-full mb-4" />
      <button
        onClick={handleLogout}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
