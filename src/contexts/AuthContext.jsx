import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signup = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  const createAdminAccount = async () => {
    try {
      const adminEmail = 'admin@ixmicheck.com';
      const adminPassword = 'admin123';
      
      // Crear la cuenta de usuario
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
      const user = userCredential.user;
      
      // Guardar el rol de administrador en Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email: adminEmail,
        role: 'admin',
        createdAt: new Date().toISOString(),
        displayName: 'Administrador'
      });
      
      return { success: true, message: '✅ Cuenta de administrador creada exitosamente' };
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        // Si la cuenta ya existe, verificar que tenga el rol de admin
        try {
          const userSnapshot = await getDoc(doc(db, 'users', currentUser?.uid || 'temp'));
          if (!userSnapshot.exists()) {
            // Si no existe el documento de usuario, crearlo
            const user = auth.currentUser;
            if (user) {
              await setDoc(doc(db, 'users', user.uid), {
                email: adminEmail,
                role: 'admin',
                createdAt: new Date().toISOString(),
                displayName: 'Administrador'
              });
            }
          }
        } catch (dbError) {
          console.error('Error al verificar/crear rol de admin:', dbError);
        }
        return { success: true, message: '✅ La cuenta de administrador ya existe' };
      }
      throw error;
    }
  };

  // Función para obtener el rol del usuario
  const getUserRole = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data().role;
      }
      // Si no existe el documento, asumir rol general para usuarios existentes
      return 'general';
    } catch (error) {
      console.error('Error al obtener rol del usuario:', error);
      return 'general';
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Obtener el rol del usuario cuando se autentica
        const role = await getUserRole(user.uid);
        setUserRole(role);
      } else {
        setUserRole(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    login,
    signup,
    logout,
    createAdminAccount,
    getUserRole
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
