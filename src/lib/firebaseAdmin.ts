// src/lib/firebaseAdmin.ts
import * as admin from 'firebase-admin';

const serviceAccountCredentials = require('../config/dryfruit-manager-firebase-adminsdk-fbsvc-1de9e71793.json');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountCredentials),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message);
    throw error; // You can uncomment this to make sure it's caught early in dev
  }
} else {
  console.log('Firebase Admin SDK already initialized.');
}

export const db = admin.apps.length ? admin.firestore() : null; // Or handle the case where db might be null if init fails
if (!db) {
    console.error("Firestore DB is not initialized. Check Firebase Admin SDK init.");
}

export const authAdmin = admin.apps.length ? admin.auth() : null; // Similarly for auth
export default admin;