import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyDpgQU3Lk9x8T9wKufcIZXWne6QH649cY0',
  authDomain: 'leehj-edu.firebaseapp.com',
  projectId: 'leehj-edu',
  storageBucket: 'leehj-edu.firebasestorage.app',
  messagingSenderId: '608374240082',
  appId: '1:608374240082:web:2f3aac250ec9af8235408b',
  databaseURL:
    'https://leehj-edu-default-rtdb.asia-southeast1.firebasedatabase.app',
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  // Prevent pending writes from hanging on some networks/proxies.
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
});

export const isFirebaseConfigured = true;
