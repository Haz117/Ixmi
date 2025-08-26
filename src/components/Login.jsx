import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingUsers, setCreatingUsers] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setError('');
      setLoading(true);
      await login(email, password);
      
      // Verificar si es admin (puedes cambiar esta lógica según tus necesidades)
      const isAdmin = email.includes('admin') || email === 'admin@ixmicheck.com';
      
      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/general');
      }
    } catch (error) {
      setError('Error al iniciar sesión: ' + error.message);
    }

    setLoading(false);
  };

  const createTestUsers = async () => {
    setCreatingUsers(true);
    setError('');
    
    try {
      // Crear usuario admin
      await signup('admin@ixmicheck.com', 'admin123');
      console.log('Usuario admin creado exitosamente');
      
      // Crear usuario general
      await signup('user@ixmicheck.com', 'user123');
      console.log('Usuario general creado exitosamente');
      
      setError('✅ Usuarios de prueba creados exitosamente!\n\nAdmin: admin@ixmicheck.com / admin123\nGeneral: user@ixmicheck.com / user123');
      
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        setError('✅ Los usuarios de prueba ya existen y están listos para usar:\n\nAdmin: admin@ixmicheck.com / admin123\nGeneral: user@ixmicheck.com / user123');
      } else {
        setError('Error al crear usuarios: ' + error.message);
      }
    }
    
    setCreatingUsers(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">IxmiCheck</h1>
          <p className="text-gray-600 mt-2">Sistema de Promotores</p>
        </div>

        {error && (
          <div className={`border px-4 py-3 rounded mb-4 ${
            error.includes('✅') 
              ? 'bg-green-100 border-green-400 text-green-700' 
              : 'bg-red-100 border-red-400 text-red-700'
          }`}>
            <pre className="whitespace-pre-line text-sm">{error}</pre>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Correo Electrónico
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="admin@ixmicheck.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-4">
          <button
            onClick={createTestUsers}
            disabled={creatingUsers || loading}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {creatingUsers ? 'Creando usuarios...' : '🔧 Crear Usuarios de Prueba'}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 mb-2">
            Primera vez usando el sistema?
          </p>
          <p className="text-xs text-gray-500">
            Haz clic en "Crear Usuarios de Prueba" para configurar automáticamente:<br />
            <span className="font-medium">Admin:</span> admin@ixmicheck.com / admin123<br />
            <span className="font-medium">General:</span> user@ixmicheck.com / user123
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
