


import { useState, useCallback } from 'react';

export const useRealtimeNotifications = () => {
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((message, type = 'info', duration = 3000) => {
    setNotification({ message, type, duration, id: Date.now() });
    
    setTimeout(() => {
      setNotification(null);
    }, duration + 500); // Tiempo extra para la animación de salida
  }, []);

  const showUpdateNotification = useCallback((message = 'Datos actualizados en tiempo real') => {
    showNotification(message, 'update', 2000);
  }, [showNotification]);

  const showSuccessNotification = useCallback((message) => {
    showNotification(message, 'success', 3000);
  }, [showNotification]);

  const showErrorNotification = useCallback((message) => {
    showNotification(message, 'error', 4000);
  }, [showNotification]);

  const showWarningNotification = useCallback((message) => {
    showNotification(message, 'warning', 3000);
  }, [showNotification]);

  return {
    notification,
    showNotification,
    showUpdateNotification,
    showSuccessNotification,
    showErrorNotification,
    showWarningNotification
  };
};

export default useRealtimeNotifications;
