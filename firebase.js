import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyACnVCHQ_nSbVutEnjpdV6hRyS9GUSvOvc",
  authDomain: "kinovo-page.firebaseapp.com",
  projectId: "kinovo-page",
  storageBucket: "kinovo-page.firebasestorage.app",
  messagingSenderId: "88640003884",
  appId: "1:88640003884:web:f6f460171fc35b8e655689",
  measurementId: "G-VS6D39V41N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserState(uid) {
  const ref = doc(db, "users", uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const payload = snapshot.data();
  return payload?.data && typeof payload.data === "object" ? payload.data : {};
}

export async function saveUserState(uid, data) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    data,
    updatedAt: serverTimestamp()
  });
}
