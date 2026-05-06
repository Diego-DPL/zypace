import AppRouter from './router';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <AppRouter />
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
