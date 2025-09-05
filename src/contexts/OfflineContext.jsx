import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
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
      console.log('Conexión restablecida');
      setIsOnline(true);
      // Al reconectar, los listeners se restablecerán automáticamente
    };

    const handleOffline = () => {
      console.log('Conexión perdida');
      setIsOnline(false);
      setRealtimeActive(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar datos del localStorage al iniciar
  useEffect(() => {
    const savedData = localStorage.getItem('ixmicheck_offline_data');
    const savedOperations = localStorage.getItem('ixmicheck_pending_operations');
    
    if (savedData) {
      try {
        setLocalData(JSON.parse(savedData));
      } catch (error) {
        console.error('Error al cargar datos offline:', error);
      }
    }
    
    if (savedOperations) {
      try {
        setPendingOperations(JSON.parse(savedOperations));
      } catch (error) {
        console.error('Error al cargar operaciones pendientes:', error);
      }
    }
  }, []);

  // Sincronizar cuando se restablezca la conexión
  useEffect(() => {
    if (isOnline && pendingOperations.length > 0) {
      syncPendingOperations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, pendingOperations]);

  // Guardar datos en localStorage
  const saveLocalData = (data) => {
    setLocalData(data);
    localStorage.setItem('ixmicheck_offline_data', JSON.stringify(data));
  };

  // Guardar operación pendiente
  const addPendingOperation = (operation) => {
    const newOperations = [...pendingOperations, { ...operation, timestamp: Date.now() }];
    setPendingOperations(newOperations);
    localStorage.setItem('ixmicheck_pending_operations', JSON.stringify(newOperations));
  };

  // Sincronizar operaciones pendientes
  const syncPendingOperations = async () => {
    if (syncing || pendingOperations.length === 0) return;
    
    setSyncing(true);
    console.log('Iniciando sincronización de', pendingOperations.length, 'operaciones pendientes');

    // Función para ejecutar operación específica
    const executeOperation = async (operation) => {
      switch (operation.type) {
        case 'UPDATE_VOTE':
          await updateVoteOnline(operation.data);
          break;
        case 'ADD_PERSON':
          await addPersonOnline(operation.data);
          break;
        case 'UPDATE_PERSON':
          await updatePersonOnline(operation.data);
          break;
        case 'DELETE_PERSON':
          await deletePersonOnline(operation.data);
          break;
        case 'UPLOAD_SECCIONAL':
          await uploadSeccionalOnline(operation.data);
          break;
        case 'UPDATE_SECCIONAL':
          await updateSeccionalOnline(operation.data);
          break;
        default:
          throw new Error(`Tipo de operación no reconocido: ${operation.type}`);
      }
    };

    const successfulOperations = [];
    const failedOperations = [];

    for (const operation of pendingOperations) {
      try {
        await executeOperation(operation);
        successfulOperations.push(operation);
        console.log('Operación sincronizada:', operation.type);
      } catch (error) {
        console.error('Error al sincronizar operación:', error);
        failedOperations.push(operation);
      }
    }

    // Actualizar operaciones pendientes (mantener solo las que fallaron)
    setPendingOperations(failedOperations);
    localStorage.setItem('ixmicheck_pending_operations', JSON.stringify(failedOperations));

    setSyncing(false);
    
    if (successfulOperations.length > 0) {
      alert(`Se sincronizaron ${successfulOperations.length} operaciones pendientes`);
    }
    
    if (failedOperations.length > 0) {
      console.warn(`${failedOperations.length} operaciones no pudieron sincronizarse`);
    }
  };

  // Operaciones específicas para Firebase
  const updateVoteOnline = async ({ seccionalId, promotorId, personaId, votoListo }) => {
    const seccionalRef = doc(db, 'seccionales', seccionalId);
    const currentData = localData[seccionalId] || {};
    
    if (!currentData.promotores?.[promotorId]?.personas?.[personaId]) {
      throw new Error('Datos locales no encontrados para la actualización de voto');
    }

    const updatedSeccional = { ...currentData };
    updatedSeccional.promotores[promotorId].personas[personaId].votoListo = votoListo;
    
    await updateDoc(seccionalRef, updatedSeccional);
  };

  const addPersonOnline = async ({ seccionalId, promotorId, personData }) => {
    const seccionalRef = doc(db, 'seccionales', seccionalId);
    const currentData = localData[seccionalId] || {};
    
    const updatedSeccional = { ...currentData };
    const personId = `persona_${Date.now()}`;
    
    if (!updatedSeccional.promotores[promotorId].personas) {
      updatedSeccional.promotores[promotorId].personas = {};
    }
    
    updatedSeccional.promotores[promotorId].personas[personId] = {
      ...personData,
      votoListo: false,
      numeroPersona: Object.keys(updatedSeccional.promotores[promotorId].personas).length + 1
    };
    
    await updateDoc(seccionalRef, updatedSeccional);
  };

  const updatePersonOnline = async ({ seccionalId, promotorId, personaId, personData }) => {
    const seccionalRef = doc(db, 'seccionales', seccionalId);
    const currentData = localData[seccionalId] || {};
    
    const updatedSeccional = { ...currentData };
    updatedSeccional.promotores[promotorId].personas[personaId] = {
      ...updatedSeccional.promotores[promotorId].personas[personaId],
      ...personData
    };
    
    await updateDoc(seccionalRef, updatedSeccional);
  };

  const deletePersonOnline = async ({ seccionalId, promotorId, personaId }) => {
    const seccionalRef = doc(db, 'seccionales', seccionalId);
    const currentData = localData[seccionalId] || {};
    
    const updatedSeccional = { ...currentData };
    delete updatedSeccional.promotores[promotorId].personas[personaId];
    
    await updateDoc(seccionalRef, updatedSeccional);
  };

  const uploadSeccionalOnline = async ({ seccionalNumber, promotoresData, userEmail }) => {
    const seccionalRef = doc(db, 'seccionales', `seccional_${seccionalNumber}`);
    await setDoc(seccionalRef, {
      numero: seccionalNumber,
      promotores: promotoresData,
      fechaActualizacion: new Date().toISOString(),
      subidoPor: userEmail || 'Usuario desconocido',
      fechaSubida: new Date().toISOString()
    }, { merge: true });
  };

  const updateSeccionalOnline = async ({ seccionalId, promotores }) => {
    const seccionalRef = doc(db, 'seccionales', seccionalId);
    await updateDoc(seccionalRef, {
      promotores: promotores,
      fechaActualizacion: new Date().toISOString()
    });
  };

  // Operaciones que funcionan offline
  const updateVoteOffline = (seccionalId, promotorId, personaId, votoListo) => {
    const currentData = { ...localData };
    
    if (!currentData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    // Actualizar datos locales
    currentData[seccionalId].promotores[promotorId].personas[personaId].votoListo = votoListo;
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'UPDATE_VOTE',
      data: { seccionalId, promotorId, personaId, votoListo }
    });

    return true;
  };

  const addPersonOffline = (seccionalId, promotorId, personData) => {
    const currentData = { ...localData };
    
    if (!currentData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    const personId = `persona_${Date.now()}`;
    
    if (!currentData[seccionalId].promotores[promotorId].personas) {
      currentData[seccionalId].promotores[promotorId].personas = {};
    }
    
    currentData[seccionalId].promotores[promotorId].personas[personId] = {
      ...personData,
      votoListo: false,
      numeroPersona: Object.keys(currentData[seccionalId].promotores[promotorId].personas).length + 1
    };
    
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'ADD_PERSON',
      data: { seccionalId, promotorId, personData }
    });

    return true;
  };

  const updatePersonOffline = (seccionalId, promotorId, personaId, personData) => {
    const currentData = { ...localData };
    
    if (!currentData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    currentData[seccionalId].promotores[promotorId].personas[personaId] = {
      ...currentData[seccionalId].promotores[promotorId].personas[personaId],
      ...personData
    };
    
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'UPDATE_PERSON',
      data: { seccionalId, promotorId, personaId, personData }
    });

    return true;
  };

  const deletePersonOffline = (seccionalId, promotorId, personaId) => {
    const currentData = { ...localData };
    
    if (!currentData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    delete currentData[seccionalId].promotores[promotorId].personas[personaId];
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'DELETE_PERSON',
      data: { seccionalId, promotorId, personaId }
    });

    return true;
  };

  const uploadSeccionalOffline = (seccionalNumber, promotoresData, userEmail = null) => {
    const currentData = { ...localData };
    const seccionalId = `seccional_${seccionalNumber}`;
    
    currentData[seccionalId] = {
      id: seccionalId,
      numero: seccionalNumber,
      promotores: promotoresData,
      fechaActualizacion: new Date().toISOString(),
      subidoPor: userEmail || 'Usuario desconocido',
      fechaSubida: new Date().toISOString()
    };
    
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'UPLOAD_SECCIONAL',
      data: { seccionalNumber, promotoresData, userEmail }
    });

    return true;
  };

  const updateSeccionalOffline = (seccionalId, promotores) => {
    const currentData = { ...localData };
    
    if (!currentData[seccionalId]) {
      console.error('Seccional no encontrada en datos locales');
      return false;
    }

    currentData[seccionalId].promotores = promotores;
    currentData[seccionalId].fechaActualizacion = new Date().toISOString();
    
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'UPDATE_SECCIONAL',
      data: { seccionalId, promotores }
    });

    return true;
  };

  // Cargar datos desde Firebase cuando esté online
  const loadDataFromFirebase = useCallback((callback, options = {}) => {
    const { enableNotifications = false, onUpdate = null } = options;
    
    console.log('🔍 DEBUG: loadDataFromFirebase llamado - isOnline:', isOnline, 'enableNotifications:', enableNotifications);
    
    if (!isOnline) {
      // Si está offline, usar datos locales
      console.log('📱 Usando datos locales (offline)');
      const seccionalesArray = Object.values(localData).sort((a, b) => a.numero - b.numero);
      callback(seccionalesArray);
      setRealtimeActive(false);
      return () => {};
    }

    // Usar ref local para evitar problemas de closure
    let initialLoad = true;
    setRealtimeActive(true);
    console.log('🔄 Iniciando conexión en tiempo real con Firestore...');

    // Si está online, suscribirse a Firebase y actualizar datos locales
    const unsubscribe = onSnapshot(
      collection(db, 'seccionales'), 
      (snapshot) => {
        const currentTime = new Date().toISOString();
        
        console.log('🔄 Actualizando datos en tiempo real...', snapshot.docs.length, 'documentos');
        console.log('🔍 DEBUG: initialLoad =', initialLoad, 'enableNotifications =', enableNotifications);
        
        const seccionalesData = [];
        const newLocalData = {};
        
        // Solo detectar cambios si NO es la carga inicial
        let changes = {
          added: [],
          modified: [],
          removed: []
        };
        
        // Si no es la primera carga Y hay datos locales previos, detectar cambios reales
        if (!initialLoad && Object.keys(localData).length > 0) {
          console.log('🔍 DEBUG: Detectando cambios, docChanges:', snapshot.docChanges().length);
          snapshot.docChanges().forEach((change) => {
            const docData = change.doc.data();
            console.log('🔍 DEBUG: Cambio detectado:', change.type, 'ID:', change.doc.id);
            
            if (change.type === 'added') {
              // Solo considerar como "agregado" si realmente no existía antes
              if (!localData[change.doc.id]) {
                changes.added.push(docData);
                console.log('✅ Nuevo documento agregado:', change.doc.id);
              }
            }
            if (change.type === 'modified') {
              changes.modified.push(docData);
              console.log('✏️ Documento modificado:', change.doc.id);
            }
            if (change.type === 'removed') {
              changes.removed.push(docData);
              console.log('❌ Documento eliminado:', change.doc.id);
            }
          });
        } else {
          console.log('🔍 DEBUG: Saltando detección de cambios - initialLoad:', initialLoad, 'localData length:', Object.keys(localData).length);
        }
        
        snapshot.forEach((doc) => {
          const data = { 
            id: doc.id, 
            ...doc.data(),
            lastUpdated: currentTime
          };
          seccionalesData.push(data);
          newLocalData[doc.id] = data;
        });
        
        // Actualizar datos locales
        saveLocalData(newLocalData);
        setLastUpdateTime(currentTime);
        
        // Solo notificar si NO es la carga inicial Y hay cambios reales Y las notificaciones no están silenciadas
        if (!initialLoad && enableNotifications && onUpdate && !notificationsMuted) {
          let notificationMessage = '';
          
          console.log('🔍 DEBUG: Procesando notificaciones - changes:', changes);
          
          if (changes.added.length > 0) {
            notificationMessage += `${changes.added.length} nueva(s) seccional(es) agregada(s). `;
          }
          if (changes.modified.length > 0) {
            notificationMessage += `${changes.modified.length} seccional(es) actualizada(s). `;
          }
          if (changes.removed.length > 0) {
            notificationMessage += `${changes.removed.length} seccional(es) eliminada(s). `;
          }
          
          if (notificationMessage.trim()) {
            console.log('📢 Enviando notificación:', notificationMessage.trim());
            onUpdate(notificationMessage.trim(), 'update');
          } else {
            console.log('🔍 DEBUG: No hay mensaje de notificación para enviar');
          }
        } else {
          console.log('🔍 DEBUG: Saltando notificaciones - initialLoad:', initialLoad, 'enableNotifications:', enableNotifications, 'onUpdate:', !!onUpdate, 'notificationsMuted:', notificationsMuted);
        }
        
        // Marcar que ya no es la carga inicial después de la primera actualización
        if (initialLoad) {
          initialLoad = false;
          console.log('✅ Carga inicial completada, activando detección de cambios');
        }
        
        const sortedData = seccionalesData.sort((a, b) => a.numero - b.numero);
        
        if (initialLoad) {
          console.log('✅ Datos iniciales cargados en tiempo real');
        } else if (changes.added.length || changes.modified.length || changes.removed.length) {
          console.log('✅ Cambios detectados en tiempo real:', changes);
        }
        
        callback(sortedData);
      },
      (error) => {
        console.error('❌ Error en tiempo real:', error);
        setRealtimeActive(false);
        
        if (enableNotifications && onUpdate) {
          onUpdate('Error en la conexión en tiempo real, usando datos locales', 'error');
        }
        
        // En caso de error, usar datos locales como fallback
        const seccionalesArray = Object.values(localData).sort((a, b) => a.numero - b.numero);
        callback(seccionalesArray);
      }
    );

    return () => {
      console.log('🔌 Desconectando listener de tiempo real');
      setRealtimeActive(false);
      unsubscribe();
    };
  }, [isOnline, localData, notificationsMuted]);

  const value = {
    isOnline,
    syncing,
    realtimeActive,
    lastUpdateTime,
    notificationsMuted,
    pendingOperations: pendingOperations.length,
    updateVoteOffline,
    addPersonOffline,
    updatePersonOffline,
    deletePersonOffline,
    uploadSeccionalOffline,
    updateSeccionalOffline,
    loadDataFromFirebase,
    syncPendingOperations: () => syncPendingOperations(),
    muteNotifications: () => setNotificationsMuted(true),
    unmuteNotifications: () => setNotificationsMuted(false),
    toggleNotifications: () => setNotificationsMuted(!notificationsMuted)
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};
