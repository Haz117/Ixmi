import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const GeneralPanel = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [seccionales, setSeccionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [showEditPersonForm, setShowEditPersonForm] = useState(false);
  const [selectedSeccional, setSelectedSeccional] = useState('');
  const [selectedPromotor, setSelectedPromotor] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all'); // all, promotor, seccional
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
  const [totalVotantesDelDia, setTotalVotantesDelDia] = useState('');
  const [diferencia, setDiferencia] = useState(null);

  useEffect(() => {
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
  }, []);

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

  const toggleVoto = async (seccionalId, promotorId, personaId, currentVoto) => {
    try {
      const seccionalRef = doc(db, 'seccionales', seccionalId);
      const seccional = seccionales.find(s => s.id === seccionalId);
      
      const updatedSeccional = { ...seccional };
      updatedSeccional.promotores[promotorId].personas[personaId].votoListo = !currentVoto;
      
      await updateDoc(seccionalRef, updatedSeccional);
    } catch (error) {
      console.error('Error al actualizar voto:', error);
    }
  };

  const handleAddPerson = async (e) => {
    e.preventDefault();
    
    if (!selectedSeccional || !selectedPromotor) {
      alert('Selecciona una seccional y un promotor');
      return;
    }

    try {
      const seccionalRef = doc(db, 'seccionales', selectedSeccional);
      const seccional = seccionales.find(s => s.id === selectedSeccional);
      
      const updatedSeccional = { ...seccional };
      const personId = `persona_${Date.now()}`;
      
      if (!updatedSeccional.promotores[selectedPromotor].personas) {
        updatedSeccional.promotores[selectedPromotor].personas = {};
      }
      
      updatedSeccional.promotores[selectedPromotor].personas[personId] = {
        ...newPerson,
        votoListo: false,
        numeroPersona: Object.keys(updatedSeccional.promotores[selectedPromotor].personas).length + 1
      };
      
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

  const handleEditPerson = (seccionalId, promotorId, personaId, persona) => {
    setEditingPerson({
      seccionalId,
      promotorId,
      personaId
    });
    setEditPersonData({
      nombreCompleto: persona.nombreCompleto,
      curp: persona.curp,
      claveElector: persona.claveElector
    });
    setShowEditPersonForm(true);
  };

  const handleUpdatePerson = async (e) => {
    e.preventDefault();
    
    if (!editingPerson) return;

    try {
      const seccionalRef = doc(db, 'seccionales', editingPerson.seccionalId);
      const seccional = seccionales.find(s => s.id === editingPerson.seccionalId);
      
      const updatedSeccional = { ...seccional };
      updatedSeccional.promotores[editingPerson.promotorId].personas[editingPerson.personaId] = {
        ...updatedSeccional.promotores[editingPerson.promotorId].personas[editingPerson.personaId],
        ...editPersonData
      };
      
      await updateDoc(seccionalRef, updatedSeccional);
      
      setEditPersonData({ nombreCompleto: '', curp: '', claveElector: '' });
      setShowEditPersonForm(false);
      setEditingPerson(null);
      
      alert('Persona actualizada exitosamente!');
    } catch (error) {
      console.error('Error al actualizar persona:', error);
      alert('Error al actualizar persona: ' + error.message);
    }
  };

  const handleDeletePerson = async (seccionalId, promotorId, personaId, nombrePersona) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar a ${nombrePersona}?`)) {
      return;
    }

    try {
      const seccionalRef = doc(db, 'seccionales', seccionalId);
      const seccional = seccionales.find(s => s.id === seccionalId);
      
      const updatedSeccional = { ...seccional };
      delete updatedSeccional.promotores[promotorId].personas[personaId];
      
      await updateDoc(seccionalRef, updatedSeccional);
      
      alert('Persona eliminada exitosamente!');
    } catch (error) {
      console.error('Error al eliminar persona:', error);
      alert('Error al eliminar persona: ' + error.message);
    }
  };

  const cancelEdit = () => {
    setShowEditPersonForm(false);
    setEditingPerson(null);
    setEditPersonData({ nombreCompleto: '', curp: '', claveElector: '' });
  };

  const handleCalcularDiferencia = () => {
    const total = parseInt(totalVotantesDelDia);
    if (isNaN(total) || total < 0) {
      alert('Por favor ingresa un número válido');
      return;
    }
    
    // Calcular total de votos registrados
    let totalVotos = 0;
    seccionales.forEach(seccional => {
      if (seccional.promotores) {
        Object.values(seccional.promotores).forEach(promotor => {
          if (promotor.personas) {
            Object.values(promotor.personas).forEach(persona => {
              if (persona.votoListo === true) {
                totalVotos++;
              }
            });
          }
        });
      }
    });
    
    const diff = total - totalVotos;
    setDiferencia(diff);
  };

  const resetDiferencia = () => {
    setTotalVotantesDelDia('');
    setDiferencia(null);
  };



  const getStats = () => {
    let totalPersonas = 0;
    let totalVotos = 0;
    const promotoresStats = {};

    seccionales.forEach(seccional => {
      if (seccional.promotores) {
        Object.values(seccional.promotores).forEach(promotor => {
          if (promotor.personas) {
            const personasPromotor = Object.values(promotor.personas);
            totalPersonas += personasPromotor.length;
            
            const votosPromotor = personasPromotor.filter(p => p.votoListo).length;
            totalVotos += votosPromotor;
            
            if (!promotoresStats[promotor.nombre]) {
              promotoresStats[promotor.nombre] = {
                totalPersonas: 0,
                totalVotos: 0
              };
            }
            
            promotoresStats[promotor.nombre].totalPersonas += personasPromotor.length;
            promotoresStats[promotor.nombre].totalVotos += votosPromotor;
          }
        });
      }
    });

    return { totalPersonas, totalVotos, promotores: promotoresStats };
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

  const stats = getStats();

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
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 space-y-4 sm:space-y-0">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Panel General</h1>
            <div className="flex items-center space-x-3">
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
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Subir Archivo Excel</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click para subir</span> o arrastra el archivo aquí
                  </p>
                  <p className="text-xs text-gray-500">Excel (.xlsx, .xls)</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            {uploading && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-blue-500">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando archivo...
                </div>
              </div>
            )}
          </div>
        </div>

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
            
            {searchTerm && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {getFilteredData().reduce((total, seccional) => {
                    return total + Object.values(seccional.promotores || {}).reduce((sum, promotor) => {
                      return sum + Object.keys(promotor.personas || {}).length;
                    }, 0);
                  }, 0)} resultados encontrados
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Limpiar búsqueda
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Add Person Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Agregar Persona</h2>
            <button
              onClick={() => setShowAddPersonForm(!showAddPersonForm)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              {showAddPersonForm ? 'Cancelar' : 'Agregar Persona'}
            </button>
          </div>
          
          {showAddPersonForm && (
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
                
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                >
                  Agregar Persona
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Edit Person Section */}
        {showEditPersonForm && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Editar Persona</h2>
              <button
                onClick={cancelEdit}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
            
            <div className="p-6">
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
                
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Actualizar Persona
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Total de Personas</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.totalPersonas}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Votos Listos</h3>
            <p className="text-3xl font-bold text-green-600">{stats.totalVotos}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Porcentaje</h3>
            <p className="text-3xl font-bold text-purple-600">
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

        {/* Sección de Votantes del Día */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Control de Votantes del Día</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total de votantes que acudieron hoy:
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={totalVotantesDelDia}
                    onChange={(e) => setTotalVotantesDelDia(e.target.value)}
                    placeholder="Ingresa el total de votantes"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleCalcularDiferencia}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Calcular
                  </button>
                  <button
                    onClick={resetDiferencia}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
              
              {diferencia !== null && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Resultado del Análisis</h3>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Votantes registrados en sistema:</span> {stats.totalVotos}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Total de votantes del día:</span> {totalVotantesDelDia}
                    </p>
                    <p className={`text-lg font-bold ${diferencia > 0 ? 'text-red-600' : diferencia < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                      {diferencia > 0 ? 
                        `Faltan ${diferencia} votantes por registrar` :
                        diferencia < 0 ?
                        `Hay ${Math.abs(diferencia)} votantes de más registrados` :
                        'Los números coinciden perfectamente'
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Datos por Seccional */}
        {getFilteredData().map((seccional) => (
          <div key={seccional.id} className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                Seccional {seccional.numero}
                {searchTerm && (
                  <span className="ml-2 text-sm text-gray-500">
                    ({Object.values(seccional.promotores || {}).reduce((sum, promotor) => {
                      return sum + Object.keys(promotor.personas || {}).length;
                    }, 0)} resultados)
                  </span>
                )}
              </h2>
            </div>
            <div className="p-6">
              {seccional.promotores && Object.entries(seccional.promotores).map(([promotorId, promotor]) => (
                <div key={promotorId} className="mb-6">
                  <h3 className="text-lg font-semibold text-blue-600 mb-3">
                    Promotor: {promotor.nombre}
                    {searchTerm && (
                      <span className="ml-2 text-sm text-gray-500">
                        ({Object.keys(promotor.personas || {}).length} resultados)
                      </span>
                    )}
                  </h3>
                  {promotor.personas && Object.keys(promotor.personas).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full table-auto">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">No.</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre Completo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CURP</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clave de Elector</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Voto Listo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {Object.entries(promotor.personas).map(([personaId, persona], index) => (
                            <tr key={personaId} className={persona.votoListo ? 'bg-green-50' : ''}>
                              <td className="px-4 py-2 text-sm text-gray-900">{index + 1}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                <span className={searchTerm && filterBy === 'nombre' && persona.nombreCompleto?.toLowerCase().includes(searchTerm.toLowerCase()) 
                                  ? 'bg-yellow-200 px-1 rounded' : ''}>
                                  {persona.nombreCompleto}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                <span className={searchTerm && filterBy === 'curp' && persona.curp?.toLowerCase().includes(searchTerm.toLowerCase()) 
                                  ? 'bg-yellow-200 px-1 rounded' : ''}>
                                  {persona.curp}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                <span className={searchTerm && filterBy === 'clave' && persona.claveElector?.toLowerCase().includes(searchTerm.toLowerCase()) 
                                  ? 'bg-yellow-200 px-1 rounded' : ''}>
                                  {persona.claveElector}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <button
                                  onClick={() => toggleVoto(seccional.id, promotorId, personaId, persona.votoListo)}
                                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    persona.votoListo
                                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                  }`}
                                >
                                  {persona.votoListo ? '✓ Votó' : 'Marcar como Votó'}
                                </button>
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleEditPerson(seccional.id, promotorId, personaId, persona)}
                                    className="bg-blue-100 text-blue-800 hover:bg-blue-200 px-2 py-1 rounded text-xs font-medium"
                                  >
                                    ✏️ Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeletePerson(seccional.id, promotorId, personaId, persona.nombreCompleto)}
                                    className="bg-red-100 text-red-800 hover:bg-red-200 px-2 py-1 rounded text-xs font-medium"
                                  >
                                    🗑️ Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No hay personas registradas para este promotor</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {getFilteredData().length === 0 && searchTerm && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No se encontraron resultados para "{searchTerm}".</p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-2 text-blue-600 hover:text-blue-800"
            >
              Limpiar búsqueda
            </button>
          </div>
        )}

        {seccionales.length === 0 && !searchTerm && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No hay datos disponibles. Sube tu primer archivo Excel para comenzar.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneralPanel;
