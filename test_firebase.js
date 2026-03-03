
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

console.log("ENV CHECK:");
console.log("Project ID:", process.env.FIREBASE_PROJECT_ID);
console.log("Client Email:", process.env.FIREBASE_CLIENT_EMAIL);
console.log("Private Key Length:", process.env.FIREBASE_PRIVATE_KEY?.length);

const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

console.log("Initialization starting...");
try {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        })
    });
    console.log("Initialization complete.");

    const db = admin.firestore();
    console.log("Firestore handle acquired.");

    console.log("Testing collection access...");
    const start = Date.now();
    db.collection('users').limit(1).get()
        .then(snapshot => {
            console.log("RESPONSE RECEIVED in", Date.now() - start, "ms");
            console.log("Snapshot empty:", snapshot.empty);
            process.exit(0);
        })
        .catch(err => {
            console.error("FIRESTORE ERROR:", err);
            process.exit(1);
        });
} catch (e) {
    console.error("INIT ERROR:", e);
    process.exit(1);
}
