import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';

const OfflineContext = createContext();

export const useOffline = () => {
  return useContext(OfflineContext);
};

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOperations, setPendingOperations] = useState([]);
  const [localData, setLocalData] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);

  // Detectar cambios en el estado de conexión
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Conexión restablecida');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('📵 Conexión perdida');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar operaciones pendientes del localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ixmicheck_pending_operations');
      if (stored) {
        setPendingOperations(JSON.parse(stored));
      }

      const storedData = localStorage.getItem('ixmicheck_offline_data');
      if (storedData) {
        setLocalData(JSON.parse(storedData));
      }
    } catch (error) {
      console.error('Error al cargar datos del localStorage:', error);
    }
  }, []);



  // FUNCIÓN PRINCIPAL DE TIEMPO REAL - ARREGLADA
  const loadDataFromFirebase = useCallback((callback, options = {}) => {
    const { enableNotifications = false, onUpdate = null } = options;
    
    console.log('🔄 [REALTIME] Iniciando conexión...');
    console.log('🔍 [REALTIME] Usuario:', auth.currentUser?.email || 'No autenticado');
    console.log('🔍 [REALTIME] Online:', isOnline);
    
    // Verificar estado básico
    if (!isOnline) {
      console.log('📱 [REALTIME] Modo offline');
      // Obtener datos actuales del estado sin dependencias
      const currentLocalData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
      const offlineData = Object.values(currentLocalData).sort((a, b) => a.numero - b.numero);
      callback(offlineData);
      setRealtimeActive(false);
      return () => {};
    }

    if (!auth.currentUser) {
      console.log('❌ [REALTIME] No hay usuario autenticado');
      setRealtimeActive(false);
      callback([]);
      return () => {};
    }

    // Control del listener
    let isFirstLoad = true;
    let isDisconnected = false;
    
    setRealtimeActive(true);
    console.log('✅ [REALTIME] Conectando a Firestore...');

    // Crear listener
    const unsubscribe = onSnapshot(
      collection(db, 'seccionales'),
      {
        includeMetadataChanges: false // Simplificar - solo cambios reales
      },
      (snapshot) => {
        if (isDisconnected) return;
        
        console.log(`📥 [REALTIME] Datos recibidos: ${snapshot.docs.length} documentos`);
        console.log(`🔍 [REALTIME] From cache: ${snapshot.metadata.fromCache}`);
        
        // Procesar datos
        const seccionalesData = [];
        const newLocalData = {};
        
        snapshot.forEach((doc) => {
          const data = { 
            id: doc.id, 
            ...doc.data(),
            lastUpdated: new Date().toISOString()
          };
          seccionalesData.push(data);
          newLocalData[doc.id] = data;
        });
        
        // Detectar cambios (solo después de la primera carga)
        if (!isFirstLoad && enableNotifications && onUpdate && !notificationsMuted) {
          const changes = snapshot.docChanges();
          console.log(`🔍 [REALTIME] Cambios detectados: ${changes.length}`);
          
          if (changes.length > 0) {
            const stats = {
              added: changes.filter(c => c.type === 'added').length,
              modified: changes.filter(c => c.type === 'modified').length,
              removed: changes.filter(c => c.type === 'removed').length
            };
            
            let message = '';
            if (stats.added > 0) message += `${stats.added} nueva(s). `;
            if (stats.modified > 0) message += `${stats.modified} actualizada(s). `;
            if (stats.removed > 0) message += `${stats.removed} eliminada(s). `;
            
            if (message.trim()) {
              console.log(`📢 [REALTIME] Notificación: ${message.trim()}`);
              onUpdate(message.trim(), 'update');
            }
          }
        }
        
        // Actualizar datos directamente sin usar el estado que causa el loop
        setLocalData(newLocalData);
        localStorage.setItem('ixmicheck_offline_data', JSON.stringify(newLocalData));
        setLastUpdateTime(new Date().toISOString());
        
        // Enviar a callback
        const sortedData = seccionalesData.sort((a, b) => a.numero - b.numero);
        callback(sortedData);
        
        if (isFirstLoad) {
          isFirstLoad = false;
          console.log('✅ [REALTIME] Primera carga completada');
        }
      },
      (error) => {
        console.error('❌ [REALTIME] Error:', error);
        console.error('❌ [REALTIME] Código:', error.code);
        console.error('❌ [REALTIME] Mensaje:', error.message);
        
        setRealtimeActive(false);
        
        // Manejar errores específicos
        if (error.code === 'permission-denied') {
          console.error('❌ [REALTIME] CRÍTICO: Sin permisos para Firestore');
          if (onUpdate) onUpdate('Error de permisos en Firestore', 'error');
        } else if (error.code === 'unauthenticated') {
          console.error('❌ [REALTIME] CRÍTICO: Usuario no autenticado');
          if (onUpdate) onUpdate('Usuario no autenticado', 'error');
        }
        
        // Fallback a datos locales desde localStorage
        const currentLocalData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
        const fallbackData = Object.values(currentLocalData).sort((a, b) => a.numero - b.numero);
        callback(fallbackData);
      }
    );

    // Función de limpieza
    return () => {
      console.log('🔌 [REALTIME] Desconectando...');
      isDisconnected = true;
      setRealtimeActive(false);
      if (unsubscribe) unsubscribe();
    };
  }, [isOnline, notificationsMuted]); // ELIMINAMOS localData de las dependencias

  // Operaciones offline básicas
  const updateVoteOffline = (seccionalId, promotorId, personaId, votoListo) => {
    const currentData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
    const updatedData = { ...currentData };
    if (updatedData[seccionalId]?.promotores?.[promotorId]?.personas?.[personaId]) {
      updatedData[seccionalId].promotores[promotorId].personas[personaId].votoListo = votoListo;
      setLocalData(updatedData);
      localStorage.setItem('ixmicheck_offline_data', JSON.stringify(updatedData));
    }
  };

  // Operaciones online básicas
  const updateVoteOnline = async ({ seccionalId, promotorId, personaId, votoListo }) => {
    const seccionalRef = doc(db, 'seccionales', seccionalId);
    const currentLocalData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
    const currentData = currentLocalData[seccionalId] || {};
    
    if (currentData.promotores?.[promotorId]?.personas?.[personaId]) {
      const updatedPersonas = {
        ...currentData.promotores[promotorId].personas,
        [personaId]: {
          ...currentData.promotores[promotorId].personas[personaId],
          votoListo: votoListo
        }
      };
      
      const updatedPromotores = {
        ...currentData.promotores,
        [promotorId]: {
          ...currentData.promotores[promotorId],
          personas: updatedPersonas
        }
      };
      
      await updateDoc(seccionalRef, {
        promotores: updatedPromotores,
        lastUpdated: new Date().toISOString()
      });
    }
  };

  // Función para agregar persona
  const addPersonOffline = (seccionalId, promotorId, personData) => {
    const currentData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
    const updatedData = { ...currentData };
    
    if (!updatedData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    if (!updatedData[seccionalId].promotores[promotorId]) {
      console.error('Promotor no encontrado en datos locales');
      return false;
    }

    const personaId = `persona_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    updatedData[seccionalId].promotores[promotorId].personas = updatedData[seccionalId].promotores[promotorId].personas || {};
    updatedData[seccionalId].promotores[promotorId].personas[personaId] = {
      ...personData,
      fechaAgregado: new Date().toISOString()
    };

    setLocalData(updatedData);
    localStorage.setItem('ixmicheck_offline_data', JSON.stringify(updatedData));
    return true;
  };

  // Función para actualizar persona
  const updatePersonOffline = (seccionalId, promotorId, personaId, personData) => {
    const currentData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
    const updatedData = { ...currentData };
    
    if (!updatedData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    if (!updatedData[seccionalId].promotores[promotorId]?.personas[personaId]) {
      console.error('Persona no encontrada en datos locales');
      return false;
    }

    updatedData[seccionalId].promotores[promotorId].personas[personaId] = {
      ...updatedData[seccionalId].promotores[promotorId].personas[personaId],
      ...personData,
      fechaActualizado: new Date().toISOString()
    };

    setLocalData(updatedData);
    localStorage.setItem('ixmicheck_offline_data', JSON.stringify(updatedData));
    return true;
  };

  // Función para eliminar persona
  const deletePersonOffline = (seccionalId, promotorId, personaId) => {
    const currentData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
    const updatedData = { ...currentData };
    
    if (!updatedData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    if (!updatedData[seccionalId].promotores[promotorId]?.personas[personaId]) {
      console.error('Persona no encontrada en datos locales');
      return false;
    }

    delete updatedData[seccionalId].promotores[promotorId].personas[personaId];
    setLocalData(updatedData);
    localStorage.setItem('ixmicheck_offline_data', JSON.stringify(updatedData));
    return true;
  };

  // Función para subir seccional
  const uploadSeccionalOffline = (seccionalNumber, promotoresData, userEmail = null) => {
    const currentData = JSON.parse(localStorage.getItem('ixmicheck_offline_data') || '{}');
    const seccionalId = `seccional_${seccionalNumber}`;
    
    const updatedData = {
      ...currentData,
      [seccionalId]: {
        id: seccionalId,
        numero: seccionalNumber,
        promotores: promotoresData,
        fechaActualizacion: new Date().toISOString(),
        subidoPor: userEmail || 'Usuario desconocido',
        fechaSubida: new Date().toISOString()
      }
    };
    
    setLocalData(updatedData);
    localStorage.setItem('ixmicheck_offline_data', JSON.stringify(updatedData));
    return true;
  };

  const value = {
    isOnline,
    syncing,
    realtimeActive,
    lastUpdateTime,
    notificationsMuted,
    pendingOperations: pendingOperations.length,
    updateVoteOffline,
    updateVoteOnline,
    loadDataFromFirebase,
    addPersonOffline,
    updatePersonOffline,
    deletePersonOffline,
    uploadSeccionalOffline,
    toggleNotifications: () => setNotificationsMuted(!notificationsMuted)
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};
