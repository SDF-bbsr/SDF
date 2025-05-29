// src/lib/firebaseAdmin.ts
import * as admin from 'firebase-admin';

const serviceAccountJsonString = process.env['FIREBASE_ADMIN_SDK_JSON'];
let serviceAccountCredentials;

if (!serviceAccountJsonString) {
  console.error(
    'CRITICAL: FIREBASE_ADMIN_SDK_JSON environment variable is NOT SET. Firebase Admin SDK will not be initialized.'
  );
} else {
  try {
    serviceAccountCredentials = JSON.parse(serviceAccountJsonString);
  } catch (error: any) {
    console.error(
      'CRITICAL: Failed to parse FIREBASE_ADMIN_SDK_JSON. Ensure it is a valid JSON string. Firebase Admin SDK will not be initialized.',
      error.message
    );
    // Ensure serviceAccountCredentials is not used if parsing failed
    serviceAccountCredentials = undefined;
  }
}

if (!admin.apps.length) {
  if (serviceAccountCredentials && serviceAccountCredentials.project_id) { // Check project_id as a basic sanity check
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountCredentials),
        // If you also use Realtime Database, you might add:
        // databaseURL: process.env.FIREBASE_DATABASE_URL (also from an env var)
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error: any) {
      console.error('Firebase Admin SDK initialization error:', error.message);
    }
  } else {
    if (!serviceAccountCredentials) {
        // This case is already covered by the parsing error or missing env var error above.
        // No need for an additional log here unless you want to be very explicit.
    } else if (!serviceAccountCredentials.project_id) {
        console.warn('Firebase Admin SDK NOT initialized: Parsed credentials object is missing project_id.');
    } else {
        // This case should ideally not be reached if the above are handled.
        console.warn('Firebase Admin SDK NOT initialized due to missing or invalid credentials.');
    }
  }
} else {
  // This log can be useful in development to know an existing instance is being reused.
  // You might choose to remove it for cleaner production logs if desired.
  console.log('Firebase Admin SDK already initialized.');
}

export const db = admin.apps.length ? admin.firestore() : null;
export const authAdmin = admin.apps.length ? admin.auth() : null;
export default admin;

// Final check: if SDK is initialized but db is null, it's an unexpected state.
if (admin.apps.length && !db) {
    console.error("CRITICAL: Firestore `db` is null, even though Firebase Admin SDK seems initialized. This could indicate an issue with Firestore service itself or its configuration in the Admin SDK.");
} else if (!admin.apps.length && serviceAccountJsonString) {
    // If JSON string was provided, but apps array is still empty, init failed.
    console.warn("Firebase Admin SDK was not initialized (initialization likely failed), so `db` and `authAdmin` will be null.");
} else if (!serviceAccountJsonString) {
    // If no JSON string was provided, this is expected.
    // console.warn("Firebase Admin SDK was not initialized (credentials not provided), so `db` and `authAdmin` will be null."); // This might be too noisy if it's an expected state
}