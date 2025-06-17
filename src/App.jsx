import LoginButton from "./components/LoginButton";
import UserProfile from "./components/UserProfile";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-3xl font-bold mb-6">Observatorio</h1>
      {!user ? <LoginButton /> : <UserProfile user={user} />}
    </div>
  );
}
