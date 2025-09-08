import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

const RealtimeTest = () => {
  const [status, setStatus] = useState('🔄 Inicializando...');
  const [connectionInfo, setConnectionInfo] = useState({});
  const { currentUser } = useAuth();

  useEffect(() => {
    const runTest = async () => {
      setStatus('🔄 Ejecutando pruebas...');
      
      // Test 1: Usuario autenticado
      if (!currentUser) {
        setStatus('❌ Usuario no autenticado');
        return;
      }
      
      setConnectionInfo(prev => ({
        ...prev,
        user: currentUser.email,
        uid: currentUser.uid
      }));

      // Test 2: Conexión a Firestore
      try {
        let docCount = 0;
        let hasError = false;
        
        const unsubscribe = onSnapshot(
          collection(db, 'seccionales'),
          (snapshot) => {
            docCount = snapshot.docs.length;
            setConnectionInfo(prev => ({
              ...prev,
              documents: docCount,
              fromCache: snapshot.metadata.fromCache,
              lastUpdate: new Date().toLocaleTimeString()
            }));
            
            if (!hasError) {
              setStatus(`✅ Conectado - ${docCount} documentos`);
            }
          },
          (error) => {
            hasError = true;
            console.error('Error en test:', error);
            setStatus(`❌ Error: ${error.code} - ${error.message}`);
            setConnectionInfo(prev => ({
              ...prev,
              error: error.code,
              errorMessage: error.message
            }));
          }
        );

        // Limpiar después de 10 segundos
        setTimeout(() => {
          unsubscribe();
        }, 10000);

      } catch (error) {
        setStatus(`❌ Error al conectar: ${error.message}`);
      }
    };

    if (currentUser) {
      runTest();
    }
  }, [currentUser]);

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'white',
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '15px',
      minWidth: '300px',
      zIndex: 1000,
      fontSize: '14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>🔧 Test de Conectividad</h4>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Estado:</strong> {status}
      </div>
      
      {connectionInfo.user && (
        <div style={{ fontSize: '12px', color: '#666' }}>
          <div><strong>Usuario:</strong> {connectionInfo.user}</div>
          <div><strong>UID:</strong> {connectionInfo.uid}</div>
          {connectionInfo.documents !== undefined && (
            <div><strong>Documentos:</strong> {connectionInfo.documents}</div>
          )}
          {connectionInfo.fromCache !== undefined && (
            <div><strong>From Cache:</strong> {connectionInfo.fromCache ? 'Sí' : 'No'}</div>
          )}
          {connectionInfo.lastUpdate && (
            <div><strong>Última actualización:</strong> {connectionInfo.lastUpdate}</div>
          )}
          {connectionInfo.error && (
            <div style={{ color: 'red' }}>
              <strong>Error:</strong> {connectionInfo.error}
              <br />
              <strong>Mensaje:</strong> {connectionInfo.errorMessage}
            </div>
          )}
        </div>
      )}
      
      <button 
        onClick={() => window.location.reload()} 
        style={{
          marginTop: '10px',
          padding: '5px 10px',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        🔄 Recargar Test
      </button>
    </div>
  );
};

export default RealtimeTest;
