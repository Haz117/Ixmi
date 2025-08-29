import React from 'react';
import { useOffline } from '../contexts/OfflineContext';

const SyncButton = () => {
  const { isOnline, syncing, pendingOperations, syncPendingOperations } = useOffline();

  if (isOnline && pendingOperations === 0) {
    return null; // No mostrar si está online y no hay operaciones pendientes
  }

  return (
    <button
      onClick={syncPendingOperations}
      disabled={syncing || !isOnline}
      className={`
        inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md
        ${syncing || !isOnline
          ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
          : 'text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
        }
        transition-colors duration-200
      `}
    >
      {syncing ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sincronizando...
        </>
      ) : (
        <>
          <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sincronizar ({pendingOperations})
        </>
      )}
    </button>
  );
};

export default SyncButton;
