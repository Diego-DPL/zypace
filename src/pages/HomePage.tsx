import AppHeader from "../components/AppHeader";
import { useAuth } from "../context/AuthContext";

const HomePage = () => {
  const { user } = useAuth();

  return (
    <div>
      <main className="p-4">
        <h1 className="text-3xl font-bold">Tu Panel de Control</h1>
        {user && <p>Bienvenido, {user.email}</p>}
      </main>
    </div>
  );
};

export default HomePage;
