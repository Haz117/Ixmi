import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';

const FirebaseConnectionTest = () => {
  const [connectionStatus, setConnectionStatus] = useState('Probando...');
  const [testResults, setTestResults] = useState([]);
  const [realtimeStatus, setRealtimeStatus] = useState('No iniciado');

  const addTestResult = (message) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(`🧪 TEST: ${message}`);
  };

  useEffect(() => {
    const runConnectionTest = async () => {
      addTestResult('Iniciando pruebas de conectividad');
      
      // Test 1: Verificar que Firebase está inicializado
      try {
        if (!db) {
          addTestResult('❌ Firebase no está inicializado');
          setConnectionStatus('Error: Firebase no inicializado');
          return;
        }
        addTestResult('✅ Firebase está inicializado correctamente');
      } catch (error) {
        addTestResult(`❌ Error al verificar Firebase: ${error.message}`);
        setConnectionStatus('Error en Firebase');
        return;
      }

      // Test 2: Verificar conexión básica con una lectura simple
      try {
        addTestResult('Probando lectura simple de Firestore...');
        const testRef = doc(db, 'test', 'connection');
        const testDoc = await getDoc(testRef);
        addTestResult('✅ Lectura simple exitosa (el documento puede no existir y está bien)');
      } catch (error) {
        addTestResult(`❌ Error en lectura simple: ${error.message}`);
        addTestResult(`❌ Código de error: ${error.code}`);
        setConnectionStatus(`Error de conexión: ${error.code}`);
        return;
      }

      // Test 3: Verificar acceso a colección seccionales
      try {
        addTestResult('Probando acceso a colección seccionales...');
        const seccionalesRef = collection(db, 'seccionales');
        
        // Intentar suscribirse al tiempo real
        setRealtimeStatus('Conectando...');
        
        const unsubscribe = onSnapshot(
          seccionalesRef,
          (snapshot) => {
            addTestResult(`✅ Listener en tiempo real funcionando! Documentos: ${snapshot.docs.length}`);
            addTestResult(`✅ From cache: ${snapshot.metadata.fromCache}`);
            addTestResult(`✅ Has pending writes: ${snapshot.metadata.hasPendingWrites}`);
            setRealtimeStatus(`Conectado - ${snapshot.docs.length} documentos`);
            setConnectionStatus('✅ Todas las pruebas exitosas');
            
            // Desconectar después de 5 segundos para evitar múltiples listeners
            setTimeout(() => {
              unsubscribe();
              setRealtimeStatus('Desconectado (prueba completa)');
            }, 5000);
          },
          (error) => {
            addTestResult(`❌ Error en tiempo real: ${error.message}`);
            addTestResult(`❌ Código de error: ${error.code}`);
            setRealtimeStatus(`Error: ${error.code}`);
            setConnectionStatus(`Error en tiempo real: ${error.code}`);
          }
        );
        
      } catch (error) {
        addTestResult(`❌ Error al acceder a seccionales: ${error.message}`);
        setConnectionStatus(`Error de acceso: ${error.code || 'Desconocido'}`);
      }
    };

    runConnectionTest();
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      width: '400px',
      maxHeight: '500px',
      backgroundColor: 'white',
      border: '2px solid #007bff',
      borderRadius: '8px',
      padding: '15px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999,
      overflow: 'auto',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#007bff' }}>
        🧪 Diagnóstico Firebase
      </h3>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Estado general:</strong> {connectionStatus}
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Tiempo real:</strong> {realtimeStatus}
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Dispositivo:</strong> {navigator.userAgent.includes('Mobile') ? '📱 Móvil' : '💻 Desktop'}
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Navegador:</strong> {
          navigator.userAgent.includes('Chrome') ? 'Chrome' :
          navigator.userAgent.includes('Firefox') ? 'Firefox' :
          navigator.userAgent.includes('Safari') ? 'Safari' :
          navigator.userAgent.includes('Edge') ? 'Edge' :
          'Otro'
        }
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Online:</strong> {navigator.onLine ? '🟢 Sí' : '🔴 No'}
      </div>
      
      <hr />
      
      <div style={{ maxHeight: '200px', overflow: 'auto' }}>
        <strong>Log de pruebas:</strong>
        {testResults.map((result, index) => (
          <div key={index} style={{ 
            padding: '2px 0', 
            borderBottom: '1px solid #eee',
            wordBreak: 'break-word'
          }}>
            {result}
          </div>
        ))}
      </div>
      
      <button 
        onClick={() => window.location.reload()} 
        style={{
          marginTop: '10px',
          padding: '5px 10px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        🔄 Recargar pruebas
      </button>
    </div>
  );
};

export default FirebaseConnectionTest;
