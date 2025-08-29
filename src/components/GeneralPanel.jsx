import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import ConnectionStatus from './ConnectionStatus';
import SyncButton from './SyncButton';
import * as XLSX from 'xlsx';

const GeneralPanel = () => {
  const { currentUser, logout } = useAuth();
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

  const [stats, setStats] = useState({
    totalPersonas: 0,
    totalVotos: 0,
    promotores: {}
  });
  const [totalVotantesDelDia, setTotalVotantesDelDia] = useState('');
  const [diferencia, setDiferencia] = useState(null);

  useEffect(() => {
    // Usar el contexto offline para cargar datos
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
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [loadDataFromFirebase, currentUser]);

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

        // Saltar fila de encabezados
        if (row[0] && typeof row[0] === 'string' && 
            (row[0].toLowerCase().includes('total') || 
             row[1] && row[1].toString().toLowerCase().includes('promotor') ||
             row[2] && row[2].toString().toLowerCase().includes('nombre'))) {
          console.log(`Saltando fila de encabezados en línea ${i}:`, row);
          continue;
        }

        // Procesar filas de datos
        if (row.length >= 3 && row[1] && row[2]) {
          const numeroPersona = row[1];
          const nombreCompleto = row[2];
          const curp = row[3] || '';
          const claveElector = row[4] || '';
          const promotor = row[5];

          // Debug: mostrar información de la fila para diagnosticar problemas
          console.log(`Fila ${i}:`, {
            numeroPersona,
            nombreCompleto,
            curp,
            claveElector,
            promotor,
            filaCompleta: row
          });

          if (!promotor || promotor.trim() === '' || promotor.toLowerCase() === 'promotor') {
            console.log(`Saltando fila ${i} porque el promotor está vacío o es el encabezado:`, promotor);
            continue;
          }

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

  const isAdmin = currentUser?.email?.includes('admin') || currentUser?.email === 'admin@ixmicheck.com';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
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
            {Object.keys(stats.promotores).length > 0 ? (
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
            ) : (
              <div className="text-center text-gray-500 py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-lg font-medium">No hay promotores registrados</p>
                <p className="text-sm">Sube un archivo Excel para ver las estadísticas por promotor</p>
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
        ) : (
          seccionales.map((seccional) => (
            <div key={seccional.id} className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b bg-blue-50">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-blue-900">
                    Seccional {seccional.numero}
                  </h2>
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
                </div>
              </div>
              
              <div className="p-6">
                {seccional.promotores && Object.keys(seccional.promotores).length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(seccional.promotores).map(([promotorId, promotor]) => (
                      <div key={promotorId} className="border rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          Promotor: {promotor.nombre}
                        </h3>
                        
                        {promotor.personas && Object.keys(promotor.personas).length > 0 ? (
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
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {Object.entries(promotor.personas).map(([personaId, persona]) => (
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
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
    </div>
  );
};

export default GeneralPanel;
