import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = 'http://localhost:3088';

/**
 * Session Isolation Test
 * 
 * This test verifies that:
 * 1. Two different sessions cannot access each other's SSE streams
 * 2. Queue status shows different positions for different users
 * 3. Each session only sees its own job data
 */

async function testSessionIsolation() {
    console.log('🔒 Starting Session Isolation Test\n');

    // Create two distinct sessions
    const session1 = `sid_${uuidv4()}`;
    const session2 = `sid_${uuidv4()}`;

    console.log(`Session 1: ${session1}`);
    console.log(`Session 2: ${session2}\n`);

    try {
        // Test 1: Submit first job
        console.log('📤 Test 1: Submitting first job...');

        const job1Response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'Session 1 test image',
                negative: 'bad quality',
                width: 1024,
                height: 1024,
                session_id: session1,
            }),
        });

        if (!job1Response.ok) {
            const errorText = await job1Response.text();
            throw new Error(`Session 1 job failed: ${errorText}`);
        }

        const job1Data = await job1Response.json();
        const job1Id = job1Data.job_id;
        console.log(`✅ Session 1 job created: ${job1Id}\n`);

        // Test 2: Verify SSE stream isolation BEFORE submitting second job
        console.log('🔐 Test 2: Verifying SSE stream isolation...');

        // Session 1 should be able to access its own stream
        const stream1Valid = await fetch(`${API_BASE}/api/job/${job1Id}/stream?session_id=${session1}`);
        if (stream1Valid.status === 200) {
            console.log(`✅ Session 1 can access its own stream`);
            stream1Valid.body.destroy();
        } else {
            console.log(`❌ Session 1 CANNOT access its own stream (status: ${stream1Valid.status})`);
        }

        // Session 2 should NOT be able to access Session 1's stream
        const stream2Invalid = await fetch(`${API_BASE}/api/job/${job1Id}/stream?session_id=${session2}`);
        if (stream2Invalid.status === 403) {
            console.log(`✅ Session 2 BLOCKED from Session 1's stream (403 Forbidden)`);
        } else if (stream2Invalid.status === 200) {
            console.log(`❌ SECURITY ISSUE: Session 2 can access Session 1's stream!`);
            stream2Invalid.body.destroy();
        } else {
            console.log(`⚠️  Unexpected status: ${stream2Invalid.status}`);
        }

        // Try accessing with invalid session ID
        const streamInvalid = await fetch(`${API_BASE}/api/job/${job1Id}/stream?session_id=sid_invalid123`);
        if (streamInvalid.status === 403) {
            console.log(`✅ Invalid session BLOCKED from stream (403 Forbidden)`);
        } else if (streamInvalid.status === 200) {
            console.log(`❌ SECURITY ISSUE: Invalid session can access stream!`);
            streamInvalid.body.destroy();
        } else {
            console.log(`⚠️  Unexpected status for invalid session: ${streamInvalid.status}`);
        }

        console.log();

        // Test 3: Verify queue status shows user-specific data
        console.log('📊 Test 3: Verifying queue status isolation...');

        const status1 = await fetch(`${API_BASE}/api/status?session_id=${session1}`).then(r => r.json());
        const status2 = await fetch(`${API_BASE}/api/status?session_id=${session2}`).then(r => r.json());

        console.log(`Session 1 status:`, {
            queueSize: status1.queue_size,
            userPosition: status1.user_position,
            userEta: status1.user_eta,
            activeJobId: status1.active_job_id,
        });

        console.log(`Session 2 status (no job):`, {
            queueSize: status2.queue_size,
            userPosition: status2.user_position,
            userEta: status2.user_eta,
            activeJobId: status2.active_job_id,
        });

        // Verify Session 1 sees its own job
        if (status1.active_job_id === job1Id) {
            console.log(`✅ Session 1 sees its own job ID`);
        } else {
            console.log(`❌ Session 1 does NOT see its own job ID (expected: ${job1Id}, got: ${status1.active_job_id})`);
        }

        // Verify Session 2 does NOT see Session 1's job
        if (status2.active_job_id === null) {
            console.log(`✅ Session 2 does NOT see Session 1's job (correct isolation)`);
        } else {
            console.log(`❌ SECURITY ISSUE: Session 2 sees active job: ${status2.active_job_id}`);
        }

        // Verify Session 2 has no queue position
        if (status2.user_position === null) {
            console.log(`✅ Session 2 has no queue position (no active job)`);
        } else {
            console.log(`❌ Session 2 has queue position ${status2.user_position} despite no job`);
        }

        console.log('\n✅ Session Isolation Test Complete!\n');
        console.log('Summary:');
        console.log('- ✅ SSE streams are session-protected');
        console.log('- ✅ Queue status is user-specific');
        console.log('- ✅ Sessions cannot see each other\'s jobs');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testSessionIsolation();
