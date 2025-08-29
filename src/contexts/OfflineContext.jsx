import React, { createContext, useContext, useEffect, useState } from 'react';
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

  // Detectar cambios en el estado de conexión
  useEffect(() => {
    const handleOnline = () => {
      console.log('Conexión restablecida');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('Conexión perdida');
      setIsOnline(false);
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

  // Ejecutar una operación específica
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
      default:
        throw new Error(`Tipo de operación no reconocido: ${operation.type}`);
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

  const uploadSeccionalOnline = async ({ seccionalNumber, promotoresData }) => {
    const seccionalRef = doc(db, 'seccionales', `seccional_${seccionalNumber}`);
    await setDoc(seccionalRef, {
      numero: seccionalNumber,
      promotores: promotoresData,
      fechaActualizacion: new Date().toISOString()
    }, { merge: true });
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

  const uploadSeccionalOffline = (seccionalNumber, promotoresData) => {
    const currentData = { ...localData };
    const seccionalId = `seccional_${seccionalNumber}`;
    
    currentData[seccionalId] = {
      id: seccionalId,
      numero: seccionalNumber,
      promotores: promotoresData,
      fechaActualizacion: new Date().toISOString()
    };
    
    saveLocalData(currentData);

    // Agregar operación pendiente
    addPendingOperation({
      type: 'UPLOAD_SECCIONAL',
      data: { seccionalNumber, promotoresData }
    });

    return true;
  };

  // Cargar datos desde Firebase cuando esté online
  const loadDataFromFirebase = (callback) => {
    if (!isOnline) {
      // Si está offline, usar datos locales
      const seccionalesArray = Object.values(localData).sort((a, b) => a.numero - b.numero);
      callback(seccionalesArray);
      return () => {};
    }

    // Si está online, suscribirse a Firebase y actualizar datos locales
    const unsubscribe = onSnapshot(collection(db, 'seccionales'), (snapshot) => {
      const seccionalesData = [];
      const newLocalData = {};
      
      snapshot.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        seccionalesData.push(data);
        newLocalData[doc.id] = data;
      });
      
      saveLocalData(newLocalData);
      callback(seccionalesData.sort((a, b) => a.numero - b.numero));
    });

    return unsubscribe;
  };

  const value = {
    isOnline,
    syncing,
    pendingOperations: pendingOperations.length,
    updateVoteOffline,
    addPersonOffline,
    updatePersonOffline,
    deletePersonOffline,
    uploadSeccionalOffline,
    loadDataFromFirebase,
    syncPendingOperations: () => syncPendingOperations()
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};
