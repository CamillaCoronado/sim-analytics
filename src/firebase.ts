import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB2B8K24rfATSMyRe5Qgzu72LuiqoK3FvA",
  authDomain: "sim-analytics-18c20.firebaseapp.com",
  projectId: "sim-analytics-18c20",
  storageBucket: "sim-analytics-18c20.firebasestorage.app",
  messagingSenderId: "546453099157",
  appId: "1:546453099157:web:19880c69a65b139eaa019c",
  measurementId: "G-ZC8NTQH9L3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);