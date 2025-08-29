import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const AdminPanel = () => {
  const { currentUser, logout, signup } = useAuth();
  const navigate = useNavigate();
  
  // Lista de emails de administradores
  const adminEmails = ['admin@example.com', 'administrador@ixmicheck.com'];
  const isAdmin = adminEmails.includes(currentUser?.email);
  
  const [seccionales, setSeccionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [showEditPersonForm, setShowEditPersonForm] = useState(false);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [selectedSeccional, setSelectedSeccional] = useState('');
  const [selectedPromotor, setSelectedPromotor] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all'); // all, promotor, seccional
  const [sortBy, setSortBy] = useState('default'); // default, alphabetical-asc, alphabetical-desc, number-asc, number-desc, newest, oldest
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
    role: 'general'
  });

  useEffect(() => {
    // Verificar si el usuario es admin
    if (!currentUser || !isAdmin) {
      navigate('/login');
      return;
    }

    // Escuchar cambios en tiempo real
    const unsubscribe = onSnapshot(collection(db, 'seccionales'), (snapshot) => {
      const seccionalesData = [];
      snapshot.forEach((doc) => {
        seccionalesData.push({ id: doc.id, ...doc.data() });
      });
      setSeccionales(seccionalesData.sort((a, b) => a.numero - b.numero));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, navigate, isAdmin]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  // Función para crear nuevos usuarios (solo admin)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('No tienes permisos para crear usuarios');
      return;
    }

    try {
      await signup(newUser.email, newUser.password);
      alert('Usuario creado exitosamente!');
      setNewUser({ email: '', password: '', role: 'general' });
      setShowCreateUserForm(false);
    } catch (error) {
      console.error('Error al crear usuario:', error);
      alert('Error al crear usuario: ' + error.message);
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
        const docRef = doc(db, 'seccionales', `seccional_${seccionalNumber}`);
        await setDoc(docRef, {
          numero: seccionalNumber,
          promotores: promotoresData,
          subidoPor: currentUser?.email || 'Usuario desconocido',
          fechaSubida: new Date().toISOString()
        });

        alert(`Seccional ${seccionalNumber} subida exitosamente con ${Object.keys(promotoresData).length} promotores!`);
      } else {
        alert('No se pudo procesar el archivo. Verifica el formato.');
      }
    } catch (error) {
      console.error('Error al procesar archivo:', error);
      alert('Error al procesar archivo: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleVotoToggle = async (seccionalId, promotorId, personaId, currentVoto) => {
    try {
      const seccional = seccionales.find(s => s.id === seccionalId);
      const updatedSeccional = { ...seccional };
      updatedSeccional.promotores[promotorId].personas[personaId].votoListo = !currentVoto;

      const seccionalRef = doc(db, 'seccionales', seccionalId);
      await updateDoc(seccionalRef, updatedSeccional);
    } catch (error) {
      console.error('Error al actualizar voto:', error);
      alert('Error al actualizar voto: ' + error.message);
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

  const filteredData = getFilteredData();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Panel de Administrador</h1>
            <div className="flex items-center space-x-4">
              {isAdmin && (
                <button
                  onClick={() => setShowCreateUserForm(!showCreateUserForm)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {showCreateUserForm ? 'Cancelar' : '+ Crear Usuario'}
                </button>
              )}
              <button
                onClick={() => setShowAddPersonForm(!showAddPersonForm)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showAddPersonForm ? 'Cancelar' : '+ Agregar Persona'}
              </button>
              <span className="text-sm text-gray-600">
                Bienvenido, {currentUser?.email}
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create User Section - Solo para admins */}
        {showCreateUserForm && isAdmin && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Crear Nuevo Usuario</h2>
              <button
                onClick={() => setShowCreateUserForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    required
                    minLength="6"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de Usuario</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="general">Usuario General</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                
                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Crear Usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateUserForm(false);
                      setNewUser({ email: '', password: '', role: 'general' });
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Person Section */}
        {showAddPersonForm && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Agregar Nueva Persona</h2>
              <button
                onClick={() => setShowAddPersonForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleAddPerson} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Seccional</label>
                    <select
                      value={selectedSeccional}
                      onChange={(e) => {
                        setSelectedSeccional(e.target.value);
                        setSelectedPromotor(''); // Reset promotor when seccional changes
                      }}
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                    <label className="block text-sm font-medium text-gray-700">Promotor</label>
                    <select
                      value={selectedPromotor}
                      onChange={(e) => setSelectedPromotor(e.target.value)}
                      required
                      disabled={!selectedSeccional}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                  <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                  <input
                    type="text"
                    value={newPerson.nombreCompleto}
                    onChange={(e) => setNewPerson({...newPerson, nombreCompleto: e.target.value})}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">CURP (opcional)</label>
                    <input
                      type="text"
                      value={newPerson.curp}
                      onChange={(e) => setNewPerson({...newPerson, curp: e.target.value})}
                      placeholder="CURP (opcional)"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Clave de Elector (opcional)</label>
                    <input
                      type="text"
                      value={newPerson.claveElector}
                      onChange={(e) => setNewPerson({...newPerson, claveElector: e.target.value})}
                      placeholder="Clave de Elector (opcional)"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                  >
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
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium"
                  >
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
                  <label className="block text-sm font-medium text-gray-700">CURP (opcional)</label>
                  <input
                    type="text"
                    value={editPersonData.curp}
                    onChange={(e) => setEditPersonData({...editPersonData, curp: e.target.value})}
                    placeholder="CURP (opcional)"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Clave de Elector (opcional)</label>
                  <input
                    type="text"
                    value={editPersonData.claveElector}
                    onChange={(e) => setEditPersonData({...editPersonData, claveElector: e.target.value})}
                    placeholder="Clave de Elector (opcional)"
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

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Subir Excel de Seccional</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-center w-full">
              <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                  </svg>
                  <p className="mb-2 text-sm text-gray-500">
                    {uploading ? 'Procesando archivo...' : (
                      <>
                        <span className="font-semibold">Click para subir</span> o arrastra y suelta
                      </>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">Solo archivos Excel (.xlsx, .xls)</p>
                </div>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Buscar Personas</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Término de búsqueda
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre, CURP, clave, promotor o seccional..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filtrar por
                </label>
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
        {filteredData.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron resultados' : 'No hay datos disponibles'}
            </h3>
            <p className="text-gray-600">
              {searchTerm 
                ? 'Intenta con un término de búsqueda diferente' 
                : 'Sube un archivo Excel para comenzar'
              }
            </p>
          </div>
        ) : (
          filteredData.map((seccional) => (
            <div key={seccional.id} className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b bg-blue-50">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-blue-900">
                    Seccional {seccional.numero}
                  </h2>
                  {/* Mostrar información de quién subió la seccional */}
                  {seccional.subidoPor && (
                    <div className="text-sm text-blue-700">
                      <div className="bg-white px-3 py-1 rounded-md shadow-sm">
                        <span className="font-medium">Subido por:</span> {seccional.subidoPor}
                        {seccional.fechaSubida && (
                          <div className="text-xs text-gray-600 mt-1">
                            {new Date(seccional.fechaSubida).toLocaleString('es-ES')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {seccional.promotores && Object.entries(seccional.promotores).map(([promotorId, promotor]) => (
                <div key={promotorId} className="border-b last:border-b-0">
                  <div className="px-6 py-3 bg-gray-50">
                    <h3 className="text-lg font-medium text-gray-900">
                      Promotor: {promotor.nombre}
                      <span className="ml-2 text-sm text-gray-600">
                        ({Object.keys(promotor.personas || {}).length} personas)
                      </span>
                    </h3>
                  </div>
                  
                  {promotor.personas && (
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
                              Clave de Elector
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Voto Listo
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {sortPersonas(promotor.personas).map((persona) => (
                            <tr key={persona.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {persona.numeroPersona}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {persona.nombreCompleto}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {persona.curp}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {persona.claveElector}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={() => handleVotoToggle(seccional.id, promotorId, persona.id, persona.votoListo)}
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                    persona.votoListo
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {persona.votoListo ? '✓ Listo' : '✗ Pendiente'}
                                </button>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                <button
                                  onClick={() => handleEditPerson(seccional.id, promotorId, persona.id, persona)}
                                  className="text-indigo-600 hover:text-indigo-900"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeletePerson(seccional.id, promotorId, persona.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
