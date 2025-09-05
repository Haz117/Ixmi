import React, { useState, useEffect } from 'react';

const RealtimeNotification = ({ message, type = 'info', duration = 3000 }) => {
  const [visible, setVisible] = useState(false);
  const [animationClass, setAnimationClass] = useState('');

  useEffect(() => {
    if (message) {
      setVisible(true);
      setAnimationClass('slide-in');
      
      const timer = setTimeout(() => {
        setAnimationClass('slide-out');
        setTimeout(() => {
          setVisible(false);
          setAnimationClass('');
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [message, duration]);

  if (!visible) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-black';
      case 'update':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-800 text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'update':
        return '🔄';
      default:
        return 'ℹ️';
    }
  };

  return (
    <>
      <style jsx>{`
        .notification-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          min-width: 300px;
          max-width: 400px;
        }
        
        .notification {
          padding: 15px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 500;
        }
        
        .slide-in {
          animation: slideInRight 0.3s ease-out;
        }
        
        .slide-out {
          animation: slideOutRight 0.3s ease-in;
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `}</style>
      
      <div className="notification-container">
        <div className={`notification ${getTypeStyles()} ${animationClass}`}>
          <span className="text-lg">{getIcon()}</span>
          <span>{message}</span>
        </div>
      </div>
    </>
  );
};

export default RealtimeNotification;
