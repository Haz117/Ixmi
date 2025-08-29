import React from 'react';
import { useOffline } from '../contexts/OfflineContext';

const ConnectionStatus = () => {
  const { isOnline, syncing, pendingOperations } = useOffline();

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: 1000,
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 'bold',
      color: 'white',
      backgroundColor: isOnline ? '#4CAF50' : '#f44336',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }}>
      {syncing ? (
        <span>🔄 Sincronizando...</span>
      ) : isOnline ? (
        <span>🟢 Conectado</span>
      ) : (
        <span>🔴 Sin conexión</span>
      )}
      {pendingOperations > 0 && (
        <div style={{ fontSize: '10px', marginTop: '2px' }}>
          {pendingOperations} operación{pendingOperations !== 1 ? 'es' : ''} pendiente{pendingOperations !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
