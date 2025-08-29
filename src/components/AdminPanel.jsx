import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import ConnectionStatus from './ConnectionStatus';
import SyncButton from './SyncButton';
import * as XLSX from 'xlsx';

const AdminPanel = () => {
  const { currentUser, logout, signup } = useAuth();
  const { 
    isOnline, 
    loadDataFromFirebase, 
    updateVoteOffline, 
    addPersonOffline, 
    updatePersonOffline, 
    deletePersonOffline,
    uploadSeccionalOffline
  } = useOffline();
  const navigate = useNavigate();
  
  const [seccionales, setSeccionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('default'); // default, alphabetical-asc, alphabetical-desc, number-asc, number-desc, newest, oldest
  const [showEditPersonForm, setShowEditPersonForm] = useState(false);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
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
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [stats, setStats] = useState({
    totalPersonas: 0,
    totalVotos: 0,
    promotores: {}
  });
  const [totalVotantesDelDia, setTotalVotantesDelDia] = useState('');
  const [diferencia, setDiferencia] = useState(null);

  useEffect(() => {
    // Verificar si el usuario es admin de manera más estricta
    const isAdmin = currentUser?.email?.includes('admin') || currentUser?.email === 'admin@ixmicheck.com';
    
    if (!currentUser || !isAdmin) {
      alert('Acceso denegado. Solo los administradores pueden acceder a este panel.');
      navigate('/general'); // Redirigir a panel general en lugar de login
      return;
    }

    // Usar el contexto offline para cargar datos
    const unsubscribe = loadDataFromFirebase((data) => {
      setSeccionales(data);
      setLoading(false);

      // Calcular estadísticas
      let totalPersonas = 0;
      let totalVotos = 0;
      const promotoresStats = {};

      data.forEach(seccional => {
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
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentUser, navigate, loadDataFromFirebase]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
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
          uploadSeccionalOffline(seccionalNumber, promotoresData);
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

  const handleEditPerson = (seccionalId, promotorId, personaId, persona) => {
    setEditingPerson({ seccionalId, promotorId, personaId });
    setEditPersonData({
      nombreCompleto: persona.nombreCompleto,
      curp: persona.curp,
      claveElector: persona.claveElector
    });
    setShowEditPersonForm(true);
  };

  const handleUpdatePerson = async (e) => {
    e.preventDefault();
    try {
      const { seccionalId, promotorId, personaId } = editingPerson;
      const seccional = seccionales.find(s => s.id === seccionalId);
      const updatedSeccional = { ...seccional };
      
      updatedSeccional.promotores[promotorId].personas[personaId] = {
        ...updatedSeccional.promotores[promotorId].personas[personaId],
        ...editPersonData
      };

      const seccionalRef = doc(db, 'seccionales', seccionalId);
      await updateDoc(seccionalRef, updatedSeccional);
      
      setShowEditPersonForm(false);
      setEditingPerson(null);
      setEditPersonData({ nombreCompleto: '', curp: '', claveElector: '' });
      
      alert('Persona actualizada exitosamente!');
    } catch (error) {
      console.error('Error al actualizar persona:', error);
      alert('Error al actualizar persona: ' + error.message);
    }
  };

  const handleDeletePerson = async (seccionalId, promotorId, personaId) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta persona?')) {
      return;
    }
    
    try {
      const seccional = seccionales.find(s => s.id === seccionalId);
      const updatedSeccional = { ...seccional };
      
      delete updatedSeccional.promotores[promotorId].personas[personaId];

      const seccionalRef = doc(db, 'seccionales', seccionalId);
      await updateDoc(seccionalRef, updatedSeccional);
      
      alert('Persona eliminada exitosamente!');
    } catch (error) {
      console.error('Error al eliminar persona:', error);
      alert('Error al eliminar persona: ' + error.message);
    }
  };

  const handleDeleteSeccional = async (seccionalId, seccionalNumero) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar completamente la Seccional ${seccionalNumero}? Esta acción no se puede deshacer y eliminará todos los promotores y personas asociadas.`)) {
      return;
    }
    
    // Segunda confirmación por la gravedad de la acción
    if (!window.confirm(`CONFIRMACIÓN FINAL: Vas a eliminar TODA la Seccional ${seccionalNumero}. ¿Estás completamente seguro?`)) {
      return;
    }
    
    try {
      const seccionalRef = doc(db, 'seccionales', seccionalId);
      await deleteDoc(seccionalRef);
      
      alert(`Seccional ${seccionalNumero} eliminada exitosamente!`);
    } catch (error) {
      console.error('Error al eliminar seccional:', error);
      alert('Error al eliminar seccional: ' + error.message);
    }
  };

  const handleDeletePromotor = async (seccionalId, promotorId, promotorNombre) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar al promotor "${promotorNombre}" y todas sus personas asociadas?`)) {
      return;
    }
    
    try {
      const seccional = seccionales.find(s => s.id === seccionalId);
      const updatedSeccional = { ...seccional };
      
      delete updatedSeccional.promotores[promotorId];

      const seccionalRef = doc(db, 'seccionales', seccionalId);
      await updateDoc(seccionalRef, updatedSeccional);
      
      alert(`Promotor "${promotorNombre}" eliminado exitosamente!`);
    } catch (error) {
      console.error('Error al eliminar promotor:', error);
      alert('Error al eliminar promotor: ' + error.message);
    }
  };

  const handleAddPerson = async (e) => {
    e.preventDefault();
    try {
      if (!selectedSeccional || !selectedPromotor) {
        alert('Por favor selecciona una seccional y un promotor');
        return;
      }

      const seccional = seccionales.find(s => s.id === selectedSeccional);
      const updatedSeccional = { ...seccional };
      
      if (!updatedSeccional.promotores[selectedPromotor]) {
        alert('Promotor no encontrado');
        return;
      }

      const personaId = `persona_${Date.now()}`;
      updatedSeccional.promotores[selectedPromotor].personas[personaId] = {
        ...newPerson,
        votoListo: false,
        numeroPersona: Object.keys(updatedSeccional.promotores[selectedPromotor].personas).length + 1,
        fechaCreacion: new Date().toISOString()
      };
      
      const seccionalRef = doc(db, 'seccionales', selectedSeccional);
      await updateDoc(seccionalRef, updatedSeccional);
      
      setNewPerson({ nombreCompleto: '', curp: '', claveElector: '' });
      setShowAddPersonForm(false);
      setSelectedSeccional('');
      setSelectedPromotor('');
      
      alert('Persona agregada exitosamente!');
    } catch (error) {
      console.error('Error al agregar persona:', error);
      alert('Error al agregar persona: ' + error.message);
    }
  };

  // Función para ordenar personas según el criterio seleccionado
  const sortPersonas = (personas) => {
    const personasArray = Object.entries(personas).map(([id, persona]) => ({ id, ...persona }));
    
    switch (sortBy) {
      case 'alphabetical-asc':
        return personasArray.sort((a, b) => {
          const nameA = (a.nombreCompleto || '').toString().toLowerCase();
          const nameB = (b.nombreCompleto || '').toString().toLowerCase();
          return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
        });
      case 'alphabetical-desc':
        return personasArray.sort((a, b) => {
          const nameA = (a.nombreCompleto || '').toString().toLowerCase();
          const nameB = (b.nombreCompleto || '').toString().toLowerCase();
          return nameB.localeCompare(nameA, 'es', { sensitivity: 'base' });
        });
      case 'number-asc':
        return personasArray.sort((a, b) => {
          const numA = parseInt(a.numeroPersona) || 0;
          const numB = parseInt(b.numeroPersona) || 0;
          return numA - numB;
        });
      case 'number-desc':
        return personasArray.sort((a, b) => {
          const numA = parseInt(a.numeroPersona) || 0;
          const numB = parseInt(b.numeroPersona) || 0;
          return numB - numA;
        });
      case 'newest':
        return personasArray.sort((a, b) => {
          const dateA = a.fechaCreacion ? new Date(a.fechaCreacion) : new Date(0);
          const dateB = b.fechaCreacion ? new Date(b.fechaCreacion) : new Date(0);
          return dateB - dateA;
        });
      case 'oldest':
        return personasArray.sort((a, b) => {
          const dateA = a.fechaCreacion ? new Date(a.fechaCreacion) : new Date(0);
          const dateB = b.fechaCreacion ? new Date(b.fechaCreacion) : new Date(0);
          return dateA - dateB;
        });
      default:
        return personasArray.sort((a, b) => {
          const numA = parseInt(a.numeroPersona) || 0;
          const numB = parseInt(b.numeroPersona) || 0;
          return numA - numB;
        });
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

  // Funciones para manejo de usuarios
  const handleAddUser = async (e) => {
    e.preventDefault();
    
    // Validaciones
    if (!newUser.email || !newUser.password || !newUser.confirmPassword) {
      alert('Por favor completa todos los campos');
      return;
    }
    
    if (newUser.password !== newUser.confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }
    
    if (newUser.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    
    try {
      await signup(newUser.email, newUser.password);
      alert('Usuario creado exitosamente!');
      setNewUser({ email: '', password: '', confirmPassword: '' });
      setShowAddUserForm(false);
    } catch (error) {
      console.error('Error al crear usuario:', error);
      let errorMessage = 'Error al crear usuario: ';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage += 'El email ya está en uso';
          break;
        case 'auth/invalid-email':
          errorMessage += 'Email inválido';
          break;
        case 'auth/weak-password':
          errorMessage += 'La contraseña es muy débil';
          break;
        default:
          errorMessage += error.message;
      }
      
      alert(errorMessage);
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



  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ConnectionStatus />
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 space-y-4 sm:space-y-0">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Panel de Administrador</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                onClick={() => setShowAddPersonForm(!showAddPersonForm)}
                className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {showAddPersonForm ? 'Cancelar' : 'Agregar Persona'}
              </button>
              <button
                onClick={() => setShowAddUserForm(!showAddUserForm)}
                className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {showAddUserForm ? 'Cancelar' : 'Agregar Usuario'}
              </button>
              <label className="inline-flex items-center bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors duration-200 shadow-sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Subir Excel
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              <SyncButton />
              <div className="flex items-center space-x-3 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="hidden sm:inline">Bienvenido, {currentUser?.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {Object.entries(stats.promotores).map(([nombre, data]) => (
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
          </div>
        </div>

        {/* Upload Status */}
        {uploading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 sm:mb-8">
            <div className="p-4 sm:p-6">
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-3 font-semibold leading-6 text-sm shadow-sm rounded-lg text-white bg-purple-600">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando archivo Excel...
                </div>
                <p className="mt-2 text-sm text-gray-600">Por favor espera mientras se procesan los datos</p>
              </div>
            </div>
          </div>
        )}

        {/* Add Person Modal */}
        {showAddPersonForm && (
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowAddPersonForm(false);
                setNewPerson({ nombreCompleto: '', curp: '', claveElector: '' });
                setSelectedSeccional('');
                setSelectedPromotor('');
              }
            }}
          >
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <svg className="w-6 h-6 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Agregar Nueva Persona
                </h3>
                <button
                  onClick={() => setShowAddPersonForm(false)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleAddPerson} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Seccional</label>
                    <select
                      value={selectedSeccional}
                      onChange={(e) => {
                        setSelectedSeccional(e.target.value);
                        setSelectedPromotor(''); // Reset promotor when seccional changes
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                    >
                      <option value="">Seleccionar Seccional</option>
                      {seccionales.map(seccional => (
                        <option key={seccional.id} value={seccional.id}>
                          Seccional {seccional.numero}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Promotor</label>
                    <select
                      value={selectedPromotor}
                      onChange={(e) => setSelectedPromotor(e.target.value)}
                      required
                      disabled={!selectedSeccional}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 transition-colors duration-200"
                    >
                      <option value="">
                        {selectedSeccional ? 'Seleccionar Promotor' : 'Primero selecciona una seccional'}
                      </option>
                      {selectedSeccional && seccionales.find(s => s.id === selectedSeccional)?.promotores && 
                        Object.entries(seccionales.find(s => s.id === selectedSeccional).promotores).map(([id, promotor]) => (
                          <option key={id} value={id}>
                            {promotor.nombre} ({Object.keys(promotor.personas || {}).length} personas)
                          </option>
                        ))
                      }
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Completo</label>
                  <input
                    type="text"
                    value={newPerson.nombreCompleto}
                    onChange={(e) => setNewPerson({...newPerson, nombreCompleto: e.target.value})}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                    placeholder="Ingresa el nombre completo"
                  />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">CURP (opcional)</label>
                    <input
                      type="text"
                      value={newPerson.curp}
                      onChange={(e) => setNewPerson({...newPerson, curp: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      placeholder="Ingresa el CURP (opcional)"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Clave de Elector (opcional)</label>
                    <input
                      type="text"
                      value={newPerson.claveElector}
                      onChange={(e) => setNewPerson({...newPerson, claveElector: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      placeholder="Ingresa la clave de elector (opcional)"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors duration-200"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Agregar Persona
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPersonForm(false);
                      setNewPerson({ nombreCompleto: '', curp: '', claveElector: '' });
                      setSelectedSeccional('');
                      setSelectedPromotor('');
                    }}
                    className="flex-1 inline-flex items-center justify-center bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg font-medium transition-colors duration-200"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add User Modal */}
        {showAddUserForm && (
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowAddUserForm(false);
                setNewUser({ email: '', password: '', confirmPassword: '' });
              }
            }}
          >
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <svg className="w-6 h-6 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Agregar Nuevo Usuario
                </h3>
                <button
                  onClick={() => setShowAddUserForm(false)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleAddUser} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                    placeholder="usuario@ejemplo.com"
                  />
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contraseña</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      required
                      minLength="6"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirmar Contraseña</label>
                    <input
                      type="password"
                      value={newUser.confirmPassword}
                      onChange={(e) => setNewUser({...newUser, confirmPassword: e.target.value})}
                      required
                      minLength="6"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      placeholder="Repite la contraseña"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors duration-200"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Crear Usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUserForm(false);
                      setNewUser({ email: '', password: '', confirmPassword: '' });
                    }}
                    className="flex-1 inline-flex items-center justify-center bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg font-medium transition-colors duration-200"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Person Modal */}
        {showEditPersonForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Editar Persona</h3>
                <button
                  onClick={() => setShowEditPersonForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleUpdatePerson} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                  <input
                    type="text"
                    value={editPersonData.nombreCompleto}
                    onChange={(e) => setEditPersonData({...editPersonData, nombreCompleto: e.target.value})}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">CURP</label>
                  <input
                    type="text"
                    value={editPersonData.curp}
                    onChange={(e) => setEditPersonData({...editPersonData, curp: e.target.value})}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Clave de Elector</label>
                  <input
                    type="text"
                    value={editPersonData.claveElector}
                    onChange={(e) => setEditPersonData({...editPersonData, claveElector: e.target.value})}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditPersonForm(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Search and Filter Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Buscar Personas</h2>
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
          </div>
        </div>

        {/* Resultados */}
        {getFilteredData().length === 0 ? (
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
                : 'Los datos se cargarán automáticamente cuando estén disponibles. Puedes subir un archivo Excel para comenzar.'
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
            <div key={seccional.id} className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 sm:mb-8 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-600 rounded-lg mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                <div className="flex flex-col">
                  <h2 className="text-lg sm:text-xl font-semibold text-blue-900">
                    Seccional {seccional.numero}
                  </h2>
                  {/* Mostrar información de quién subió la seccional */}
                  {seccional.subidoPor && (
                    <div className="text-sm text-blue-700 mt-1">
                      <span className="font-medium">Subido por:</span> {seccional.subidoPor}
                      {seccional.fechaSubida && (
                        <span className="ml-2 text-xs">
                          ({new Date(seccional.fechaSubida).toLocaleString('es-ES')})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                </div>
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
              </div>
              
              {seccional.promotores && Object.entries(seccional.promotores).map(([promotorId, promotor]) => (
                <div key={promotorId} className="border-b border-gray-200 last:border-b-0">
                  <div className="px-4 sm:px-6 py-3 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                    <div className="flex items-center">
                      <div className="p-1.5 bg-gray-600 rounded-lg mr-3">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-medium text-gray-900">
                          {promotor.nombre}
                        </h3>
                        <p className="text-sm sm:text-base text-gray-600">
                          {Object.keys(promotor.personas || {}).length} personas registradas
                        </p>
                      </div>
                    </div>
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
                  </div>
                  
                  {promotor.personas && (
                    <div className="overflow-x-auto">
                      <div className="min-w-full">
                        {/* Desktop Table */}
                        <div className="hidden lg:block">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CURP</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clave de Elector</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voto Listo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {sortPersonas(promotor.personas).map((persona) => (
                                <tr key={persona.id} className="hover:bg-gray-50 transition-colors duration-200">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{persona.numeroPersona}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{persona.nombreCompleto}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{persona.curp}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{persona.claveElector}</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                      onClick={() => handleVotoToggle(seccional.id, promotorId, persona.id, persona.votoListo)}
                                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                                        persona.votoListo
                                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                                      }`}
                                    >
                                      {persona.votoListo ? (
                                        <>
                                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                          </svg>
                                          Listo
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                          Pendiente
                                        </>
                                      )}
                                    </button>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                    <button
                                      onClick={() => handleEditPerson(seccional.id, promotorId, persona.id, persona)}
                                      className="text-indigo-600 hover:text-indigo-900 transition-colors duration-200"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => handleDeletePerson(seccional.id, promotorId, persona.id)}
                                      className="text-red-600 hover:text-red-900 transition-colors duration-200"
                                    >
                                      Eliminar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Mobile Cards */}
                        <div className="lg:hidden space-y-4 p-4">
                          {sortPersonas(promotor.personas).map((persona) => (
                            <div key={persona.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 text-base">{persona.nombreCompleto}</h4>
                                  <p className="text-sm text-gray-600">#{persona.numeroPersona}</p>
                                </div>
                                <button
                                  onClick={() => handleVotoToggle(seccional.id, promotorId, persona.id, persona.votoListo)}
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
                                    persona.votoListo
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {persona.votoListo ? 'Listo' : 'Pendiente'}
                                </button>
                              </div>
                              <div className="space-y-1 text-sm text-gray-600 mb-3">
                                <p><span className="font-medium">CURP:</span> {persona.curp}</p>
                                <p><span className="font-medium">Clave:</span> {persona.claveElector}</p>
                              </div>
                              <div className="flex space-x-3 text-sm">
                                <button
                                  onClick={() => handleEditPerson(seccional.id, promotorId, persona.id, persona)}
                                  className="text-indigo-600 hover:text-indigo-900 font-medium"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeletePerson(seccional.id, promotorId, persona.id)}
                                  className="text-red-600 hover:text-red-900 font-medium"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
