import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PrivateRoute = ({ children, requireAdmin = false }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  
  // Si no hay usuario, redirigir a login
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  // Verificar si el usuario es admin
  const isAdmin = currentUser?.email?.includes('admin') || currentUser?.email === 'admin@ixmicheck.com';
  
  // Si se requiere admin y el usuario no es admin
  if (requireAdmin && !isAdmin) {
    // Si está intentando acceder a /admin, redirigir a /general
    if (location.pathname === '/admin') {
      return <Navigate to="/general" />;
    }
    return <Navigate to="/login" />;
  }
  
  return children;
};

export default PrivateRoute;
