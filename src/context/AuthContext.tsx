import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, AuthErrorCodes } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthorized: boolean | null; // null means we are still checking
  login: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthError(null);

      if (currentUser) {
        const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
        
        // If VITE_OWNER_EMAIL is set and doesn't match, deny access.
        // We also check against lowercase just in case.
        if (ownerEmail && currentUser.email?.toLowerCase() !== ownerEmail.toLowerCase()) {
          setIsAuthorized(false);
          setLoading(false);
          return;
        }

        setIsAuthorized(true);

        // Ensure user document exists in Firestore
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userRef);
          
          if (!docSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email || '',
              createdAt: serverTimestamp()
            });
          }
        } catch (error: any) {
          console.error("Error creating user doc:", error);
          if (error.code === 'permission-denied') {
            setIsAuthorized(false);
          }
        }
      } else {
        setIsAuthorized(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
        } else {
          throw new Error('No se pudo obtener el token de Google');
        }
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === AuthErrorCodes.POPUP_CLOSED_BY_USER) {
        setAuthError('Acceso cancelado.');
      } else if (error.code === AuthErrorCodes.NETWORK_REQUEST_FAILED) {
        setAuthError('Error de conexión. Revisa tu internet.');
      } else {
        setAuthError('Ocurrió un error inesperado al iniciar sesión.');
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAuthorized(null);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthorized, login, logout, authError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
