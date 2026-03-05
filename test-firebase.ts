
import { db } from './src/lib/firebase';

async function testNewFirebase() {
    try {
        console.log("Testing NEW Firebase project connectivity...");
        // Try to write a test document
        const testRef = await db.collection('_connection_test').add({
            message: 'Connection test successful!',
            timestamp: new Date().toISOString()
        });
        console.log("✅ WRITE SUCCESS! Test doc ID:", testRef.id);

        // Clean it up
        await testRef.delete();
        console.log("✅ DELETE SUCCESS! Cleanup done.");

        // Test a read
        const snapshot = await db.collection('lessonPlans').limit(1).get();
        console.log("✅ READ SUCCESS! Found docs:", snapshot.size);

        console.log("\n🎉 NEW FIREBASE PROJECT IS WORKING PERFECTLY!");
    } catch (error: any) {
        console.error("❌ Firebase Test FAILED!");
        console.error("Error Code:", error.code);
        console.error("Error Message:", error.message);
    }
}

testNewFirebase();
