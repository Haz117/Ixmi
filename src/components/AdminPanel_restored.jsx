import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';

const AdminPanel = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [seccionales, setSeccionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
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
  const [stats, setStats] = useState({
    totalPersonas: 0,
    totalVotos: 0,
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Afiliados</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.totalPersonas}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Asistió a Votar</h3>
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
              <div className="px-6 py-4 border-b bg-blue-50">
                <h2 className="text-xl font-semibold text-blue-900">
                  Seccional {seccional.numero}
                </h2>
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
