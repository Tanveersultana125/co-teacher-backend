const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            })
        });
        console.log('Firebase initialized');
    } catch (e) {
        console.error('Initialization error:', e);
        process.exit(1);
    }
}

const db = admin.firestore();

async function test() {
    try {
        const snapshot = await db.collection('lessonPlans').limit(5).get();
        console.log('Lessons found:', snapshot.size);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id}, Title: ${data.title}, Teacher: ${data.teacherId}, Type: ${data.type}`);
        });

    } catch (e) {
        console.error('Query Error:', e);
    }
}

test();
