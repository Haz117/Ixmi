import React from 'react';
import { useOffline } from '../contexts/OfflineContext';

const RealtimeStatus = () => {
  const { 
    realtimeActive, 
    pendingOperations
  } = useOffline();

  return (
    <div className="flex items-center gap-2 text-sm">
      {pendingOperations > 0 && (
        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
          {pendingOperations} pendientes
        </span>
      )}
      {realtimeActive && (
        <div className="animate-pulse w-2 h-2 bg-green-500 rounded-full"></div>
      )}
    </div>
  );
};

export default RealtimeStatus;
