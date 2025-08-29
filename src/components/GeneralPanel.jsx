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
      
      if (isAdmin) {
        // Los admin pueden ver todas las seccionales
        setSeccionales(data);
      } else {
        // Los usuarios generales solo ven las seccionales que subieron ellos
        const userSeccionales = data.filter(seccional => 
          seccional.subidoPor === currentUser?.email
        );
        setSeccionales(userSeccionales);
      }
      setLoading(false);
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
          const match = row[0].match(/\\d+/);
          if (match) {
            seccionalNumber = match[0];
          }
          continue;
        }

        // Procesar filas de datos
        if (row.length >= 3 && row[1] && row[2]) {
          const numeroPersona = row[1];
          const nombreCompleto = row[2];
          const curp = row[3] || '';
          const claveElector = row[4] || '';
          const promotor = row[5];

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
                                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        persona.votoListo
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {persona.votoListo ? 'Voto Listo' : 'Pendiente'}
                                      </span>
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
