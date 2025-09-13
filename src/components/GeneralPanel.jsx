import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import ConnectionStatus from './ConnectionStatus';
import SyncButton from './SyncButton';
import RealtimeNotification from './RealtimeNotification';
import { useRealtimeNotifications } from '../hooks/useRealtimeNotifications';
import * as XLSX from 'xlsx';

const GeneralPanel = () => {
  const { currentUser, logout } = useAuth();
  const { 
    isOnline, 
    realtimeActive,
    loadDataFromFirebase, 
    updateVoteOffline, 
    addPersonOffline, 
    updatePersonOffline, 
    deletePersonOffline,
    uploadSeccionalOffline,
    updateSeccionalOffline
  } = useOffline();
  const navigate = useNavigate();
  const { notification, showUpdateNotification, showSuccessNotification, showErrorNotification } = useRealtimeNotifications();
  
  const [seccionales, setSeccionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [showEditPersonForm, setShowEditPersonForm] = useState(false);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [selectedSeccional, setSelectedSeccional] = useState('');
  const [selectedPromotor, setSelectedPromotor] = useState('');
  const [editingPerson, setEditingPerson] = useState(null);
  const [editPersonData, setEditPersonData] = useState({
    nombreCompleto: '',
    curp: '',
    claveElector: ''
  });
  const [newPerson, setNewPerson] = useState({
    nombreCompleto: '',
    curp: '',
    claveElector: ''
  });

  // Estados para crear nueva seccional
  const [showCreateSeccionalForm, setShowCreateSeccionalForm] = useState(false);
  const [newSeccional, setNewSeccional] = useState({
    numero: '',
    promotor: ''
  });

  // Estados para agregar nuevo promotor
  const [showAddPromotorForm, setShowAddPromotorForm] = useState(false);
  const [selectedSeccionalForPromotor, setSelectedSeccionalForPromotor] = useState('');
  const [newPromotor, setNewPromotor] = useState({
    nombre: ''
  });

  const [stats, setStats] = useState({
    totalPersonas: 0,
    totalVotos: 0,
    promotores: {}
  });
  const [totalVotantesDelDia, setTotalVotantesDelDia] = useState('');
  const [diferencia, setDiferencia] = useState(null);

  useEffect(() => {
    // Usar el contexto offline para cargar datos con notificaciones de tiempo real
    const unsubscribe = loadDataFromFirebase((data) => {
      // Verificar si el usuario es admin
      const isAdmin = currentUser?.email?.includes('admin') || currentUser?.email === 'admin@ixmicheck.com';
      
      let filteredData;
      if (isAdmin) {
        // Los admin pueden ver todas las seccionales
        filteredData = data;
      } else {
        // Los usuarios generales solo ven las seccionales que subieron ellos
        filteredData = data.filter(seccional => 
          seccional.subidoPor === currentUser?.email
        );
      }
      
      setSeccionales(filteredData);
      setLoading(false);

      // Calcular estadísticas solo para las seccionales filtradas
      let totalPersonas = 0;
      let totalVotos = 0;
      const promotoresStats = {};

      filteredData.forEach(seccional => {
        if (seccional.promotores) {
          Object.entries(seccional.promotores).forEach(([, promotor]) => {
            if (!promotoresStats[promotor.nombre]) {
              promotoresStats[promotor.nombre] = {
                totalPersonas: 0,
                totalVotos: 0
              };
            }
            
            if (promotor.personas) {
              const personas = Object.values(promotor.personas);
              promotoresStats[promotor.nombre].totalPersonas += personas.length;
              promotoresStats[promotor.nombre].totalVotos += personas.filter(p => p.votoListo).length;
              
              totalPersonas += personas.length;
              totalVotos += personas.filter(p => p.votoListo).length;
            }
          });
        }
      });

      setStats({
        totalPersonas,
        totalVotos,
        promotores: promotoresStats
      });
    }, {
      enableNotifications: true,
      onUpdate: (message, type) => {
        if (type === 'update') {
          showUpdateNotification(message);
        } else if (type === 'error') {
          showErrorNotification(message);
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [loadDataFromFirebase, currentUser, showUpdateNotification, showErrorNotification]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleVotoToggle = async (seccionalId, promotorId, personaId, currentVoto) => {
    try {
      const newVoto = !currentVoto;
      
      // Actualizar estado local inmediatamente para reflejar el cambio (optimistic update)
      setSeccionales(prevSeccionales => 
        prevSeccionales.map(seccional => {
          if (seccional.id === seccionalId) {
            const updated = { ...seccional };
            updated.promotores[promotorId].personas[personaId].votoListo = newVoto;
            return updated;
          }
          return seccional;
        })
      );
      
      if (isOnline) {
        // Si está online, actualizar directamente en Firebase
        const seccional = seccionales.find(s => s.id === seccionalId);
        const updatedSeccional = { ...seccional };
        updatedSeccional.promotores[promotorId].personas[personaId].votoListo = newVoto;

        const seccionalRef = doc(db, 'seccionales', seccionalId);
        await updateDoc(seccionalRef, updatedSeccional);
      } else {
        // Si está offline, usar el contexto offline
        const success = updateVoteOffline(seccionalId, promotorId, personaId, newVoto);
        if (!success) {
          alert('Error al actualizar voto offline');
          // Revertir el cambio optimista en caso de error
          setSeccionales(prevSeccionales => 
            prevSeccionales.map(seccional => {
              if (seccional.id === seccionalId) {
                const reverted = { ...seccional };
                reverted.promotores[promotorId].personas[personaId].votoListo = currentVoto;
                return reverted;
              }
              return seccional;
            })
          );
          return;
        }
      }
    } catch (error) {
      console.error('Error al actualizar voto:', error);
      alert('Error al actualizar voto: ' + error.message);
      
      // Revertir el cambio optimista en caso de error
      setSeccionales(prevSeccionales => 
        prevSeccionales.map(seccional => {
          if (seccional.id === seccionalId) {
            const reverted = { ...seccional };
            reverted.promotores[promotorId].personas[personaId].votoListo = currentVoto;
            return reverted;
          }
          return seccional;
        })
      );
    }
  };

  const handleCalcularDiferencia = () => {
    const total = parseInt(totalVotantesDelDia);
    if (isNaN(total) || total < 0) {
      alert('Por favor ingresa un número válido');
      return;
    }
    const diff = total - stats.totalVotos;
    setDiferencia(diff);
  };

  const resetDiferencia = () => {
    setTotalVotantesDelDia('');
    setDiferencia(null);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Procesar los datos del Excel
      let seccionalNumber = null;
      const promotoresData = {};

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Buscar el número de seccional
        if (row[0] && typeof row[0] === 'string' && row[0].includes('SECCIONAL')) {
          const match = row[0].match(/\d+/);
          if (match) {
            seccionalNumber = match[0];
          }
          continue;
        }

        // Procesar filas de datos - Solo requiere nombre completo
        if (row.length >= 3 && row[1] && row[2]) {
          const numeroPersona = row[1];
          const nombreCompleto = row[2];
          const curp = row[3] || ''; // CURP opcional
          const claveElector = row[4] || ''; // Clave de Elector opcional
          const promotor = row[5];

          // Verificar que tenga promotor
          if (!promotor) continue;

          if (!promotoresData[promotor]) {
            promotoresData[promotor] = {
              nombre: promotor,
              personas: {}
            };
          }

          promotoresData[promotor].personas[`persona_${numeroPersona}`] = {
            numeroPersona,
            nombreCompleto,
            curp,
            claveElector,
            votoListo: false
          };
        }
      }

      if (seccionalNumber && Object.keys(promotoresData).length > 0) {
        if (isOnline) {
          // Si está online, subir directamente a Firebase
          const seccionalRef = doc(db, 'seccionales', `seccional_${seccionalNumber}`);
          await setDoc(seccionalRef, {
            numero: seccionalNumber,
            promotores: promotoresData,
            fechaActualizacion: new Date().toISOString(),
            subidoPor: currentUser?.email || 'Usuario desconocido',
            fechaSubida: new Date().toISOString()
          }, { merge: true });
        } else {
          // Si está offline, guardar localmente
          uploadSeccionalOffline(seccionalNumber, promotoresData, currentUser?.email);
        }

        alert(`Datos de la Seccional ${seccionalNumber} ${isOnline ? 'subidos' : 'guardados localmente'} exitosamente!`);
      } else {
        alert('No se pudo procesar el archivo. Verifica el formato.');
      }
    } catch (error) {
      console.error('Error al procesar el archivo:', error);
      alert('Error al procesar el archivo: ' + error.message);
    }
    setUploading(false);
    event.target.value = '';
  };

  // Función para crear una nueva seccional
  const handleCreateSeccional = async () => {
    if (!newSeccional.numero || !newSeccional.promotor) {
      alert('Por favor completa todos los campos (número de seccional y promotor)');
      return;
    }

    const seccionalNumber = newSeccional.numero;
    const seccionalId = `seccional_${seccionalNumber}`;

    // Verificar si la seccional ya existe
    if (seccionales.find(s => s.numero === seccionalNumber)) {
      alert('Ya existe una seccional con este número');
      return;
    }

    const promotoresData = {
      [newSeccional.promotor]: {
        nombre: newSeccional.promotor,
        personas: {}
      }
    };

    try {
      if (isOnline) {
        // Si está online, crear directamente en Firebase
        const seccionalRef = doc(db, 'seccionales', seccionalId);
        await setDoc(seccionalRef, {
          numero: seccionalNumber,
          promotores: promotoresData,
          fechaActualizacion: new Date().toISOString(),
          subidoPor: currentUser?.email || 'Usuario desconocido',
          fechaSubida: new Date().toISOString()
        });
      } else {
        // Si está offline, usar el contexto offline
        uploadSeccionalOffline(seccionalNumber, promotoresData, currentUser?.email);
      }

      alert(`Seccional ${seccionalNumber} creada exitosamente con promotor ${newSeccional.promotor}`);
      setShowCreateSeccionalForm(false);
      setNewSeccional({ numero: '', promotor: '' });
    } catch (error) {
      console.error('Error al crear seccional:', error);
      alert('Error al crear seccional: ' + error.message);
    }
  };

  // Función para agregar un nuevo promotor a una seccional existente
  const handleAddPromotor = async () => {
    if (!selectedSeccionalForPromotor || !newPromotor.nombre) {
      alert('Por favor selecciona una seccional y escribe el nombre del promotor');
      return;
    }

    const seccional = seccionales.find(s => s.id === selectedSeccionalForPromotor);
    if (!seccional) {
      alert('Seccional no encontrada');
      return;
    }

    // Verificar si el promotor ya existe
    if (seccional.promotores && seccional.promotores[newPromotor.nombre]) {
      alert('Ya existe un promotor con este nombre en esta seccional');
      return;
    }

    try {
      const updatedSeccional = { ...seccional };
      if (!updatedSeccional.promotores) {
        updatedSeccional.promotores = {};
      }
      
      updatedSeccional.promotores[newPromotor.nombre] = {
        nombre: newPromotor.nombre,
        personas: {}
      };

      if (isOnline) {
        // Si está online, actualizar directamente en Firebase
        const seccionalRef = doc(db, 'seccionales', selectedSeccionalForPromotor);
        await updateDoc(seccionalRef, {
          promotores: updatedSeccional.promotores,
          fechaActualizacion: new Date().toISOString()
        });
      } else {
        // Si está offline, usar la función offline
        const success = updateSeccionalOffline(selectedSeccionalForPromotor, updatedSeccional.promotores);
        
        if (!success) {
          alert('Error al agregar promotor offline');
          return;
        }

        // Actualizar datos locales también
        setSeccionales(prevSeccionales =>
          prevSeccionales.map(s =>
            s.id === selectedSeccionalForPromotor ? updatedSeccional : s
          )
        );
      }

      alert(`Promotor ${newPromotor.nombre} agregado exitosamente a la seccional ${seccional.numero}`);
      setShowAddPromotorForm(false);
      setSelectedSeccionalForPromotor('');
      setNewPromotor({ nombre: '' });
    } catch (error) {
      console.error('Error al agregar promotor:', error);
      alert('Error al agregar promotor: ' + error.message);
    }
  };

  // Función para agregar una nueva persona
  const handleAddPerson = async () => {
    if (!selectedSeccional || !selectedPromotor || !newPerson.nombreCompleto) {
      alert('Por favor completa todos los campos requeridos (seccional, promotor y nombre completo)');
      return;
    }

    const seccional = seccionales.find(s => s.id === selectedSeccional);
    if (!seccional) {
      alert('Seccional no encontrada');
      return;
    }

    try {
      if (isOnline) {
        // Si está online, agregar directamente a Firebase
        const updatedSeccional = { ...seccional };
        const personId = `persona_${Date.now()}`;
        
        if (!updatedSeccional.promotores[selectedPromotor].personas) {
          updatedSeccional.promotores[selectedPromotor].personas = {};
        }
        
        const numeroPersona = Object.keys(updatedSeccional.promotores[selectedPromotor].personas).length + 1;
        
        updatedSeccional.promotores[selectedPromotor].personas[personId] = {
          numeroPersona,
          nombreCompleto: newPerson.nombreCompleto,
          curp: newPerson.curp || '',
          claveElector: newPerson.claveElector || '',
          votoListo: false
        };

        const seccionalRef = doc(db, 'seccionales', selectedSeccional);
        await updateDoc(seccionalRef, {
          promotores: updatedSeccional.promotores,
          fechaActualizacion: new Date().toISOString()
        });
      } else {
        // Si está offline, usar el contexto offline
        const success = addPersonOffline(selectedSeccional, selectedPromotor, {
          nombreCompleto: newPerson.nombreCompleto,
          curp: newPerson.curp || '',
          claveElector: newPerson.claveElector || ''
        });

        if (!success) {
          alert('Error al agregar persona offline');
          return;
        }
      }

      alert(`Persona ${newPerson.nombreCompleto} agregada exitosamente`);
      setShowAddPersonForm(false);
      setNewPerson({ nombreCompleto: '', curp: '', claveElector: '' });
      setSelectedSeccional('');
      setSelectedPromotor('');
    } catch (error) {
      console.error('Error al agregar persona:', error);
      alert('Error al agregar persona: ' + error.message);
    }
  };

  // Función para eliminar persona
  const handleDeletePerson = async (seccionalId, promotorId, personaId, personaNombre) => {
    const seccional = seccionales.find(s => s.id === seccionalId);
    
    // Verificar que el usuario puede eliminar (debe ser admin o el que subió la seccional)
    if (!isAdmin && seccional?.subidoPor !== currentUser?.email) {
      alert('Solo puedes eliminar personas de seccionales que tú hayas subido');
      return;
    }

    if (!window.confirm(`¿Estás seguro de que quieres eliminar a "${personaNombre}"?`)) {
      return;
    }

    try {
      if (isOnline) {
        // Si está online, eliminar directamente de Firebase
        const updatedSeccional = { ...seccional };
        delete updatedSeccional.promotores[promotorId].personas[personaId];

        const seccionalRef = doc(db, 'seccionales', seccionalId);
        await updateDoc(seccionalRef, {
          promotores: updatedSeccional.promotores,
          fechaActualizacion: new Date().toISOString()
        });

        // Actualizar estado local
        setSeccionales(prev => prev.map(s => s.id === seccionalId ? updatedSeccional : s));
      } else {
        // Si está offline, usar el contexto offline
        const success = deletePersonOffline(seccionalId, promotorId, personaId);
        if (!success) {
          alert('Error al eliminar persona offline');
          return;
        }
      }

      alert('Persona eliminada exitosamente');
    } catch (error) {
      console.error('Error al eliminar persona:', error);
      alert('Error al eliminar persona: ' + error.message);
    }
  };

  // Función para eliminar promotor
  const handleDeletePromotor = async (seccionalId, promotorId, promotorNombre) => {
    const seccional = seccionales.find(s => s.id === seccionalId);
    
    // Verificar que el usuario puede eliminar (debe ser admin o el que subió la seccional)
    if (!isAdmin && seccional?.subidoPor !== currentUser?.email) {
      alert('Solo puedes eliminar promotores de seccionales que tú hayas subido');
      return;
    }

    if (!window.confirm(`¿Estás seguro de que quieres eliminar al promotor "${promotorNombre}" y todas sus personas asociadas?`)) {
      return;
    }

    try {
      if (isOnline) {
        // Si está online, eliminar directamente de Firebase
        const updatedSeccional = { ...seccional };
        delete updatedSeccional.promotores[promotorId];

        const seccionalRef = doc(db, 'seccionales', seccionalId);
        await updateDoc(seccionalRef, {
          promotores: updatedSeccional.promotores,
          fechaActualizacion: new Date().toISOString()
        });

        // Actualizar estado local
        setSeccionales(prev => prev.map(s => s.id === seccionalId ? updatedSeccional : s));
      } else {
        alert('No se puede eliminar promotores en modo offline. Conéctate a internet e inténtalo de nuevo.');
        return;
      }

      alert('Promotor eliminado exitosamente');
    } catch (error) {
      console.error('Error al eliminar promotor:', error);
      alert('Error al eliminar promotor: ' + error.message);
    }
  };

  // Función para eliminar seccional completa
  const handleDeleteSeccional = async (seccionalId, seccionalNumero) => {
    const seccional = seccionales.find(s => s.id === seccionalId);
    
    // Verificar que el usuario puede eliminar (debe ser admin o el que subió la seccional)
    if (!isAdmin && seccional?.subidoPor !== currentUser?.email) {
      alert('Solo puedes eliminar seccionales que tú hayas subido');
      return;
    }

    if (!window.confirm(`¿Estás seguro de que quieres eliminar completamente la Seccional ${seccionalNumero}? Esta acción no se puede deshacer y eliminará todos los promotores y personas asociadas.`)) {
      return;
    }

    if (!window.confirm(`CONFIRMACIÓN FINAL: Vas a eliminar TODA la Seccional ${seccionalNumero}. ¿Estás completamente seguro?`)) {
      return;
    }

    try {
      if (isOnline) {
        // Si está online, eliminar directamente de Firebase
        const seccionalRef = doc(db, 'seccionales', seccionalId);
        await deleteDoc(seccionalRef);

        // Actualizar estado local
        setSeccionales(prev => prev.filter(s => s.id !== seccionalId));
      } else {
        alert('No se pueden eliminar seccionales completas en modo offline. Conéctate a internet e inténtalo de nuevo.');
        return;
      }

      alert(`Seccional ${seccionalNumero} eliminada exitosamente`);
    } catch (error) {
      console.error('Error al eliminar seccional:', error);
      alert('Error al eliminar seccional: ' + error.message);
    }
  };

  // Función para filtrar personas basada en el término de búsqueda
  const filterPersonas = (personas, promotorNombre, seccionalNumero) => {
    if (!searchTerm) return personas;
    
    return Object.fromEntries(
      Object.entries(personas).filter(([, persona]) => {
        const searchLower = searchTerm.toLowerCase();
        
        if (filterBy === 'all') {
          return (
            persona.nombreCompleto?.toLowerCase().includes(searchLower) ||
            persona.curp?.toLowerCase().includes(searchLower) ||
            persona.claveElector?.toLowerCase().includes(searchLower) ||
            promotorNombre?.toLowerCase().includes(searchLower) ||
            seccionalNumero?.toString().includes(searchLower)
          );
        } else if (filterBy === 'promotor') {
          return promotorNombre?.toLowerCase().includes(searchLower);
        } else if (filterBy === 'seccional') {
          return seccionalNumero?.toString().includes(searchLower);
        } else if (filterBy === 'nombre') {
          return persona.nombreCompleto?.toLowerCase().includes(searchLower);
        } else if (filterBy === 'curp') {
          return persona.curp?.toLowerCase().includes(searchLower);
        } else if (filterBy === 'clave') {
          return persona.claveElector?.toLowerCase().includes(searchLower);
        }
        
        return false;
      })
    );
  };

  // Función para obtener todas las personas que coinciden con la búsqueda
  const getFilteredData = () => {
    if (!searchTerm) return seccionales;
    
    return seccionales.map(seccional => {
      const filteredPromotores = {};
      
      if (seccional.promotores) {
        Object.entries(seccional.promotores).forEach(([promotorId, promotor]) => {
          if (promotor.personas) {
            const filteredPersonas = filterPersonas(promotor.personas, promotor.nombre, seccional.numero);
            
            if (Object.keys(filteredPersonas).length > 0) {
              filteredPromotores[promotorId] = {
                ...promotor,
                personas: filteredPersonas
              };
            }
          }
        });
      }
      
      return {
        ...seccional,
        promotores: filteredPromotores
      };
    }).filter(seccional => Object.keys(seccional.promotores || {}).length > 0);
  };

  // Función para filtrar promotores en las estadísticas
  const getFilteredPromotorStats = () => {
    if (!searchTerm) return stats.promotores;
    
    const filtered = {};
    Object.entries(stats.promotores).forEach(([nombre, data]) => {
      const searchLower = searchTerm.toLowerCase();
      
      if (filterBy === 'all' || filterBy === 'promotor') {
        if (nombre.toLowerCase().includes(searchLower)) {
          filtered[nombre] = data;
        }
      }
    });
    
    return filtered;
  };

  // Función para filtrar personas dentro de un promotor específico
  const getFilteredPersonasForTable = (personas, promotorNombre) => {
    if (!searchTerm) return personas;
    
    return Object.fromEntries(
      Object.entries(personas).filter(([, persona]) => {
        const searchLower = searchTerm.toLowerCase();
        
        if (filterBy === 'all') {
          return (
            persona.nombreCompleto?.toLowerCase().includes(searchLower) ||
            persona.curp?.toLowerCase().includes(searchLower) ||
            persona.claveElector?.toLowerCase().includes(searchLower) ||
            promotorNombre?.toLowerCase().includes(searchLower) ||
            persona.numeroPersona?.toString().includes(searchLower)
          );
        } else if (filterBy === 'nombre') {
          return persona.nombreCompleto?.toLowerCase().includes(searchLower);
        } else if (filterBy === 'curp') {
          return persona.curp?.toLowerCase().includes(searchLower);
        } else if (filterBy === 'clave') {
          return persona.claveElector?.toLowerCase().includes(searchLower);
        } else if (filterBy === 'promotor') {
          return promotorNombre?.toLowerCase().includes(searchLower);
        }
        
        return false;
      })
    );
  };

  // Función para ordenar personas
  const getSortedPersonas = (personas) => {
    const personasArray = Object.entries(personas);
    
    switch (sortBy) {
      case 'alphabetical-asc':
        return personasArray.sort(([, a], [, b]) => 
          (a.nombreCompleto || '').localeCompare(b.nombreCompleto || '')
        );
      case 'alphabetical-desc':
        return personasArray.sort(([, a], [, b]) => 
          (b.nombreCompleto || '').localeCompare(a.nombreCompleto || '')
        );
      case 'number-asc':
        return personasArray.sort(([, a], [, b]) => 
          (a.numeroPersona || 0) - (b.numeroPersona || 0)
        );
      case 'number-desc':
        return personasArray.sort(([, a], [, b]) => 
          (b.numeroPersona || 0) - (a.numeroPersona || 0)
        );
      case 'newest':
      case 'oldest':
        // Para estos casos mantener el orden por número por defecto
        return personasArray.sort(([, a], [, b]) => 
          (a.numeroPersona || 0) - (b.numeroPersona || 0)
        );
      default: // 'default'
        return personasArray.sort(([, a], [, b]) => 
          (a.numeroPersona || 0) - (b.numeroPersona || 0)
        );
    }
  };

  const isAdmin = currentUser?.email?.includes('admin') || currentUser?.email === 'admin@ixmicheck.com';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notificaciones de tiempo real */}
      {notification && (
        <RealtimeNotification 
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
        />
      )}
      
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center flex-col sm:flex-row">
              <h1 className="text-3xl font-bold text-gray-900">
                {isAdmin ? 'Panel General (Vista Admin)' : 'Panel General'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ConnectionStatus />
              <SyncButton />
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mensaje informativo para usuarios no admin */}
        {!isAdmin && (
          <div className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    🔒 Modo Aislamiento Activado
                  </h3>
                  <p className="mt-2 text-sm text-blue-700">
                    <strong>Máxima Seguridad:</strong> Solo puedes ver y gestionar las seccionales que TÚ has subido. 
                    No puedes ver datos subidos por otros usuarios (ni siquiera por administradores). 
                    Este aislamiento garantiza la privacidad total de cada usuario.
                  </p>
                  <div className="mt-2 text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                    👤 Usuario: {currentUser?.email} | 📊 Tus seccionales: {seccionales.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Subir Archivo Excel</h2>
          </div>
          <div className="p-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="mt-4">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="mt-2 block text-sm font-medium text-gray-900">
                      {uploading ? 'Procesando archivo...' : 'Haz clic para subir un archivo Excel'}
                    </span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    Archivos Excel (.xlsx, .xls)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sección de Gestión Manual */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Gestión Manual</h2>
            <p className="text-sm text-gray-600 mt-1">Crear seccionales y agregar personas sin necesidad de Excel</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Botón para crear seccional */}
              <button
                onClick={() => setShowCreateSeccionalForm(true)}
                className="flex items-center justify-center p-6 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-colors duration-200"
              >
                <div className="text-center">
                  <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="font-medium">Crear Nueva Seccional</span>
                </div>
              </button>

              {/* Botón para agregar promotor */}
              <button
                onClick={() => setShowAddPromotorForm(true)}
                disabled={seccionales.length === 0}
                className="flex items-center justify-center p-6 border-2 border-dashed border-green-300 rounded-lg text-green-600 hover:border-green-400 hover:bg-green-50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-center">
                  <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-medium">Agregar Promotor</span>
                </div>
              </button>

              {/* Botón para agregar persona */}
              <button
                onClick={() => setShowAddPersonForm(true)}
                disabled={seccionales.length === 0}
                className="flex items-center justify-center p-6 border-2 border-dashed border-purple-300 rounded-lg text-purple-600 hover:border-purple-400 hover:bg-purple-50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-center">
                  <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span className="font-medium">Agregar Persona</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Sección de Votantes del Día */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Control de Votantes del Día</h2>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  Total de votantes que acudieron hoy:
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    value={totalVotantesDelDia}
                    onChange={(e) => setTotalVotantesDelDia(e.target.value)}
                    placeholder="Ingresa el total de votantes"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCalcularDiferencia}
                      className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Calcular
                    </button>
                    <button
                      onClick={resetDiferencia}
                      className="inline-flex items-center bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Limpiar
                    </button>
                  </div>
                </div>
              </div>
              
              {diferencia !== null && (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-6 rounded-xl border border-gray-200">
                  <div className="flex items-center mb-3">
                    <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900">Resultado del Análisis</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Registrados</p>
                        <p className="text-lg font-bold text-blue-600">{stats.totalVotos}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total del día</p>
                        <p className="text-lg font-bold text-green-600">{totalVotantesDelDia}</p>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg">
                      <p className={`text-base sm:text-lg font-bold text-center ${diferencia > 0 ? 'text-red-600' : diferencia < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {diferencia > 0 ? 
                          `Faltan ${diferencia} votantes por registrar` :
                          diferencia < 0 ?
                          `Hay ${Math.abs(diferencia)} votantes de más registrados` :
                          'Los números coinciden perfectamente'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Total Afiliados</h3>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.totalPersonas}</p>
              </div>
              <div className="p-2 sm:p-3 bg-blue-100 rounded-full">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Asistió a Votar</h3>
                <p className="text-2xl sm:text-3xl font-bold text-green-600">{stats.totalVotos}</p>
              </div>
              <div className="p-2 sm:p-3 bg-green-100 rounded-full">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Porcentaje</h3>
                <p className="text-2xl sm:text-3xl font-bold text-purple-600">
                  {stats.totalPersonas > 0 ? Math.round((stats.totalVotos / stats.totalPersonas) * 100) : 0}%
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-purple-100 rounded-full">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Buscar en Registros</h2>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Término de búsqueda
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, CURP, clave, promotor o seccional..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filtrar por
                </label>
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                >
                  <option value="all">Todo</option>
                  <option value="nombre">Nombre</option>
                  <option value="curp">CURP</option>
                  <option value="clave">Clave de Elector</option>
                  <option value="promotor">Promotor</option>
                  <option value="seccional">Seccional</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ordenar por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                >
                  <option value="default">Por defecto (Número)</option>
                  <option value="alphabetical-asc">Alfabético A-Z</option>
                  <option value="alphabetical-desc">Alfabético Z-A</option>
                  <option value="number-asc">Número (menor a mayor)</option>
                  <option value="number-desc">Número (mayor a menor)</option>
                  <option value="newest">Más recientes primero</option>
                  <option value="oldest">Más antiguos primero</option>
                </select>
              </div>
            </div>
            
            {searchTerm && (
              <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-blue-800">
                    Mostrando resultados para: "<strong>{searchTerm}</strong>"
                  </span>
                </div>
                <button
                  onClick={() => setSearchTerm('')}
                  className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Limpiar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Estadísticas por Promotor */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Estadísticas por Promotor</h2>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {Object.keys(getFilteredPromotorStats()).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {Object.entries(getFilteredPromotorStats()).map(([nombre, data]) => (
                  <div key={nombre} className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow duration-200">
                    <h4 className="font-semibold text-gray-900 text-base sm:text-lg mb-2">{nombre}</h4>
                    <div className="space-y-1">
                      <p className="text-sm sm:text-base text-gray-600">
                        <span className="font-medium">Personas:</span> {data.totalPersonas}
                      </p>
                      <p className="text-sm sm:text-base text-gray-600">
                        <span className="font-medium">Votos:</span> {data.totalVotos}
                      </p>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progreso</span>
                        <span>{data.totalPersonas > 0 ? Math.round((data.totalVotos / data.totalPersonas) * 100) : 0}%</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${data.totalPersonas > 0 ? (data.totalVotos / data.totalPersonas) * 100 : 0}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-lg font-medium">
                  {searchTerm ? 'No se encontraron promotores que coincidan' : 'No hay promotores registrados'}
                </p>
                <p className="text-sm">
                  {searchTerm 
                    ? 'Intenta con un término de búsqueda diferente o ajusta los filtros'
                    : 'Sube un archivo Excel para ver las estadísticas por promotor'
                  }
                </p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="mt-4 inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Data Display */}
        {loading ? (
          <div className="text-center py-12">
            <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-2 text-gray-600">Cargando datos...</p>
          </div>
        ) : seccionales.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay datos disponibles
            </h3>
            <p className="text-gray-600">
              {isAdmin 
                ? 'No hay seccionales en el sistema o sube un archivo Excel para comenzar'
                : 'No has subido ninguna seccional aún. Sube un archivo Excel para comenzar'
              }
            </p>
          </div>
        ) : getFilteredData().length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 20.5a7.962 7.962 0 01-5.657-2.343m0 0L3.515 15.33M12 6.5a7.962 7.962 0 016.484 3.343L21.314 12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron resultados' : 'No hay datos disponibles'}
            </h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {searchTerm 
                ? 'Intenta con un término de búsqueda diferente o ajusta los filtros' 
                : (isAdmin 
                  ? 'No hay seccionales en el sistema o sube un archivo Excel para comenzar'
                  : 'No has subido ninguna seccional aún. Sube un archivo Excel para comenzar'
                )
              }
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-4 inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          getFilteredData().map((seccional) => (
            <div key={seccional.id} className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b bg-blue-50">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-blue-900">
                    Seccional {seccional.numero}
                  </h2>
                  <div className="flex items-center space-x-4">
                    {/* Mostrar información de quién subió la seccional */}
                    {seccional.subidoPor && (
                      <div className="text-sm text-blue-700">
                        <div className="bg-blue-100 px-3 py-1 rounded-md">
                          <span className="font-medium">Subido por:</span> {seccional.subidoPor}
                          {seccional.fechaSubida && (
                            <div className="text-xs text-blue-600 mt-1">
                              {new Date(seccional.fechaSubida).toLocaleDateString('es-ES', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Botón para eliminar seccional */}
                    {(isAdmin || seccional.subidoPor === currentUser?.email) && (
                      <button
                        onClick={() => handleDeleteSeccional(seccional.id, seccional.numero)}
                        className="inline-flex items-center bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm"
                        title="Eliminar toda la seccional"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">Eliminar Seccional</span>
                        <span className="sm:hidden">Eliminar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                {seccional.promotores && Object.keys(seccional.promotores).length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(seccional.promotores).map(([promotorId, promotor]) => (
                      <div key={promotorId} className="border rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Promotor: {promotor.nombre}
                          </h3>
                          {/* Botón para eliminar promotor */}
                          {(isAdmin || seccional.subidoPor === currentUser?.email) && (
                            <button
                              onClick={() => handleDeletePromotor(seccional.id, promotorId, promotor.nombre)}
                              className="inline-flex items-center bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-200 shadow-sm"
                              title="Eliminar promotor y todas sus personas"
                            >
                              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span className="hidden sm:inline">Eliminar</span>
                            </button>
                          )}
                        </div>
                        
                        {promotor.personas && Object.keys(promotor.personas).length > 0 ? (
                          <div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      #
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Nombre Completo
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      CURP
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Clave Elector
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Estado Voto
                                    </th>
                                    {/* Columna de acciones para eliminar */}
                                    {(isAdmin || seccional.subidoPor === currentUser?.email) && (
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Acciones
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {(() => {
                                    const filteredPersonas = getFilteredPersonasForTable(promotor.personas, promotor.nombre);
                                    const sortedPersonas = getSortedPersonas(filteredPersonas);
                                    
                                    if (sortedPersonas.length === 0) {
                                      return (
                                        <tr>
                                          <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                            {searchTerm 
                                              ? `No se encontraron personas que coincidan con "${searchTerm}"`
                                              : 'No hay personas registradas para este promotor'
                                            }
                                          </td>
                                        </tr>
                                      );
                                    }
                                    
                                    return sortedPersonas.map(([personaId, persona]) => (
                                      <tr key={personaId}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                          {persona.numeroPersona}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                          {persona.nombreCompleto}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                          {persona.curp || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                          {persona.claveElector || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                          <button
                                            onClick={() => handleVotoToggle(seccional.id, promotorId, personaId, persona.votoListo)}
                                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 cursor-pointer ${
                                              persona.votoListo
                                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                            }`}
                                          >
                                            {persona.votoListo ? (
                                              <>
                                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                                Voto Listo
                                              </>
                                            ) : (
                                              <>
                                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Pendiente
                                              </>
                                            )}
                                          </button>
                                        </td>
                                        {/* Columna de acciones para eliminar persona */}
                                        {(isAdmin || seccional.subidoPor === currentUser?.email) && (
                                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                              onClick={() => handleDeletePerson(seccional.id, promotorId, personaId, persona.nombreCompleto)}
                                              className="text-red-600 hover:text-red-900 transition-colors duration-200"
                                            >
                                              Eliminar
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ));
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500">No hay personas registradas para este promotor.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No hay promotores registrados en esta seccional.</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal para crear nueva seccional */}
      {showCreateSeccionalForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Crear Nueva Seccional</h3>
                <button
                  onClick={() => setShowCreateSeccionalForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Seccional *
                  </label>
                  <input
                    type="text"
                    value={newSeccional.numero}
                    onChange={(e) => setNewSeccional({...newSeccional, numero: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: 001, 002, etc."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Promotor *
                  </label>
                  <input
                    type="text"
                    value={newSeccional.promotor}
                    onChange={(e) => setNewSeccional({...newSeccional, promotor: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre completo del promotor"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowCreateSeccionalForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateSeccional}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Crear Seccional
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para agregar promotor */}
      {showAddPromotorForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Agregar Nuevo Promotor</h3>
                <button
                  onClick={() => setShowAddPromotorForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seleccionar Seccional *
                  </label>
                  <select
                    value={selectedSeccionalForPromotor}
                    onChange={(e) => setSelectedSeccionalForPromotor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Selecciona una seccional</option>
                    {seccionales
                      .filter(seccional => seccional.subidoPor === currentUser?.email || isAdmin)
                      .map(seccional => (
                        <option key={seccional.id} value={seccional.id}>
                          Seccional {seccional.numero}
                        </option>
                      ))
                    }
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Promotor *
                  </label>
                  <input
                    type="text"
                    value={newPromotor.nombre}
                    onChange={(e) => setNewPromotor({...newPromotor, nombre: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Nombre completo del promotor"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddPromotorForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddPromotor}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  Agregar Promotor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para agregar persona */}
      {showAddPersonForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Agregar Nueva Persona</h3>
                <button
                  onClick={() => setShowAddPersonForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seleccionar Seccional *
                  </label>
                  <select
                    value={selectedSeccional}
                    onChange={(e) => {
                      setSelectedSeccional(e.target.value);
                      setSelectedPromotor(''); // Reset promotor cuando cambia seccional
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Selecciona una seccional</option>
                    {seccionales
                      .filter(seccional => seccional.subidoPor === currentUser?.email || isAdmin)
                      .map(seccional => (
                        <option key={seccional.id} value={seccional.id}>
                          Seccional {seccional.numero}
                        </option>
                      ))
                    }
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seleccionar Promotor *
                  </label>
                  <select
                    value={selectedPromotor}
                    onChange={(e) => setSelectedPromotor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    disabled={!selectedSeccional}
                  >
                    <option value="">Selecciona un promotor</option>
                    {selectedSeccional && seccionales
                      .find(s => s.id === selectedSeccional)?.promotores &&
                      Object.values(seccionales.find(s => s.id === selectedSeccional).promotores)
                        .map(promotor => (
                          <option key={promotor.nombre} value={promotor.nombre}>
                            {promotor.nombre}
                          </option>
                        ))
                    }
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    value={newPerson.nombreCompleto}
                    onChange={(e) => setNewPerson({...newPerson, nombreCompleto: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Nombre completo de la persona"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CURP
                  </label>
                  <input
                    type="text"
                    value={newPerson.curp}
                    onChange={(e) => setNewPerson({...newPerson, curp: e.target.value.toUpperCase()})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="CURP (opcional)"
                    maxLength="18"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clave de Elector
                  </label>
                  <input
                    type="text"
                    value={newPerson.claveElector}
                    onChange={(e) => setNewPerson({...newPerson, claveElector: e.target.value.toUpperCase()})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Clave de elector (opcional)"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddPersonForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddPerson}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                >
                  Agregar Persona
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneralPanel;
