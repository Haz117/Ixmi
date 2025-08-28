import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const AdminPanel = () => {
  const { currentUser, logout, signup } = useAuth();
  const navigate = useNavigate();
  
  const [seccionales, setSeccionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
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
    votosExternos: 0,
    promotores: {}
  });

  useEffect(() => {
    // Verificar si el usuario es admin
    if (!currentUser || !currentUser.email.includes('admin')) {
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

      // Calcular estadísticas
      let totalPersonas = 0;
      let totalVotos = 0;
      const promotoresStats = {};

      seccionalesData.forEach(seccional => {
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

    return () => unsubscribe();
  }, [currentUser, navigate]);

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

        // Procesar filas de datos
        if (row.length >= 6 && row[1] && row[2] && row[3]) {
          const numeroPersona = row[1];
          const nombreCompleto = row[2];
          const curp = row[3];
          const claveElector = row[4];
          const promotor = row[5];

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
        // Guardar en Firebase
        const seccionalRef = doc(db, 'seccionales', `seccional_${seccionalNumber}`);
        await setDoc(seccionalRef, {
          numero: seccionalNumber,
          promotores: promotoresData,
          fechaActualizacion: new Date().toISOString()
        }, { merge: true });

        alert(`Datos de la Seccional ${seccionalNumber} subidos exitosamente!`);
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
        numeroPersona: Object.keys(updatedSeccional.promotores[selectedPromotor].personas).length + 1
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

  const handleExternalVotesUpdate = async (value) => {
    try {
      const statsRef = doc(db, 'stats', 'voting');
      await setDoc(statsRef, { votosExternos: parseInt(value) || 0 }, { merge: true });
    } catch (error) {
      console.error('Error al actualizar votos externos:', error);
      alert('Error al actualizar votos externos');
    }
  };

  useEffect(() => {
    const unsubscribeStats = onSnapshot(doc(db, 'stats', 'voting'), (doc) => {
      if (doc.exists()) {
        setStats(prevStats => ({
          ...prevStats,
          votosExternos: doc.data().votosExternos || 0
        }));
      }
    });

    return () => unsubscribeStats();
  }, []);

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
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Panel de Administrador</h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAddPersonForm(!showAddPersonForm)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showAddPersonForm ? 'Cancelar' : '+ Agregar Persona'}
              </button>
              <button
                onClick={() => setShowAddUserForm(!showAddUserForm)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showAddUserForm ? 'Cancelar' : '+ Agregar Usuario'}
              </button>
              <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium cursor-pointer">
                📁 Subir Excel
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
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
        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Total de Personas Registradas</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.totalPersonas}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Votos Registrados</h3>
            <p className="text-3xl font-bold text-green-600">{stats.totalVotos}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Votos Externos</h3>
            <input
              type="number"
              min="0"
              value={stats.votosExternos}
              onChange={(e) => handleExternalVotesUpdate(e.target.value)}
              className="w-full p-2 border rounded text-2xl font-bold text-orange-600 mb-2"
            />
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Total de Votos</h3>
            <p className="text-3xl font-bold text-purple-600">
              {stats.totalVotos + stats.votosExternos}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Porcentaje de Votos Registrados</h3>
            <p className="text-3xl font-bold text-indigo-600">
              {stats.totalPersonas > 0 ? Math.round((stats.totalVotos / stats.totalPersonas) * 100) : 0}%
            </p>
          </div>
        </div>

        {/* Estadísticas por Promotor */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Estadísticas por Promotor</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(stats.promotores).map(([nombre, data]) => (
                <div key={nombre} className="border rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900">{nombre}</h4>
                  <p className="text-sm text-gray-600">
                    Personas: {data.totalPersonas} | Votos: {data.totalVotos}
                  </p>
                  <div className="mt-2">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full"
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
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="p-6">
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-purple-500">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando archivo Excel...
                </div>
              </div>
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
                    <label className="block text-sm font-medium text-gray-700">CURP</label>
                    <input
                      type="text"
                      value={newPerson.curp}
                      onChange={(e) => setNewPerson({...newPerson, curp: e.target.value})}
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Clave de Elector</label>
                    <input
                      type="text"
                      value={newPerson.claveElector}
                      onChange={(e) => setNewPerson({...newPerson, claveElector: e.target.value})}
                      required
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

        {/* Add User Section */}
        {showAddUserForm && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Agregar Nuevo Usuario</h2>
              <button
                onClick={() => setShowAddUserForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="usuario@ejemplo.com"
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
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirmar Contraseña</label>
                  <input
                    type="password"
                    value={newUser.confirmPassword}
                    onChange={(e) => setNewUser({...newUser, confirmPassword: e.target.value})}
                    required
                    minLength="6"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Repite la contraseña"
                  />
                </div>
                
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Crear Usuario
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUserForm(false);
                      setNewUser({ email: '', password: '', confirmPassword: '' });
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
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Buscar Personas</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          </div>
        </div>

        {/* Resultados */}
        {getFilteredData().length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron resultados' : 'No hay datos disponibles'}
            </h3>
            <p className="text-gray-600">
              {searchTerm 
                ? 'Intenta con un término de búsqueda diferente' 
                : 'Los datos se cargarán automáticamente cuando estén disponibles'
              }
            </p>
          </div>
        ) : (
          getFilteredData().map((seccional) => (
            <div key={seccional.id} className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b bg-blue-50 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-blue-900">
                  Seccional {seccional.numero}
                </h2>
                <button
                  onClick={() => handleDeleteSeccional(seccional.id, seccional.numero)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm font-medium flex items-center space-x-1"
                  title="Eliminar toda la seccional"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                  </svg>
                  <span>Eliminar Seccional</span>
                </button>
              </div>
              
              {seccional.promotores && Object.entries(seccional.promotores).map(([promotorId, promotor]) => (
                <div key={promotorId} className="border-b last:border-b-0">
                  <div className="px-6 py-3 bg-gray-50 flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">
                      Promotor: {promotor.nombre}
                      <span className="ml-2 text-sm text-gray-600">
                        ({Object.keys(promotor.personas || {}).length} personas)
                      </span>
                    </h3>
                    <button
                      onClick={() => handleDeletePromotor(seccional.id, promotorId, promotor.nombre)}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-medium flex items-center space-x-1"
                      title="Eliminar promotor y todas sus personas"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                      <span>Eliminar</span>
                    </button>
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
                          {Object.entries(promotor.personas).map(([personaId, persona]) => (
                            <tr key={personaId} className="hover:bg-gray-50">
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
                                  onClick={() => handleVotoToggle(seccional.id, promotorId, personaId, persona.votoListo)}
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
                                  onClick={() => handleEditPerson(seccional.id, promotorId, personaId, persona)}
                                  className="text-indigo-600 hover:text-indigo-900"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeletePerson(seccional.id, promotorId, personaId)}
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
