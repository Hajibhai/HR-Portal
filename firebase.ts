import { initializeApp, deleteApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  deleteUser
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const loginWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const registerWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);
export const logout = () => signOut(auth);

// Function to create a user without logging in (using a secondary app instance)
export const adminCreateUser = async (email: string, pass: string) => {
  const secondaryAppName = `Secondary_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await signOut(secondaryAuth);
    // Delete the secondary app to clean up
    await deleteApp(secondaryApp);
    return userCredential.user;
  } catch (error) {
    try { await deleteApp(secondaryApp); } catch (e) {}
    throw error;
  }
};

// Function to delete a user from Auth (requires their email and password)
export const adminDeleteUser = async (email: string, pass: string) => {
  const secondaryAppName = `DeleteUserApp_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    console.log(`Attempting to delete Auth user: ${email}`);
    const userCredential = await signInWithEmailAndPassword(secondaryAuth, email, pass);
    const user = userCredential.user;
    await deleteUser(user);
    console.log(`Successfully deleted Auth user: ${email}`);
    await deleteApp(secondaryApp);
  } catch (error: any) {
    console.warn(`Auth deletion error for ${email}:`, error.code || error.message);
    try { await deleteApp(secondaryApp); } catch (e) {}
    
    // If user is already gone or password changed, we don't want to block Firestore deletion
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      console.log("User not found in Auth or invalid credentials, proceeding...");
      return; 
    }
    throw error;
  }
};
