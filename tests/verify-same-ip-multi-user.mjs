import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = 'http://localhost:3088';

/**
 * Same-IP Multi-User Test
 * 
 * This test verifies that multiple users from the same IP address
 * can submit jobs simultaneously without interfering with each other.
 */

async function testSameIpMultiUser() {
    console.log('🌐 Testing Multiple Users from Same IP\n');

    // Create two distinct sessions (simulating two users on same network)
    const session1 = `sid_${uuidv4()}`;
    const session2 = `sid_${uuidv4()}`;

    console.log(`Session 1 (User A): ${session1}`);
    console.log(`Session 2 (User B): ${session2}\n`);

    try {
        // Submit job from Session 1
        console.log('📤 User A submitting job...');
        const job1Response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'User A test image',
                negative: 'bad quality',
                width: 1024,
                height: 1024,
                session_id: session1,
            }),
        });

        if (!job1Response.ok) {
            const errorText = await job1Response.text();
            throw new Error(`User A job failed: ${errorText}`);
        }

        const job1Data = await job1Response.json();
        console.log(`✅ User A job created: ${job1Data.job_id}\n`);

        // Submit job from Session 2 (same IP, different session)
        console.log('📤 User B submitting job from SAME IP...');
        const job2Response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'User B test image',
                negative: 'bad quality',
                width: 1024,
                height: 1024,
                session_id: session2,
            }),
        });

        if (!job2Response.ok) {
            const errorData = await job2Response.json();
            if (errorData.error === 'CONCURRENT_LIMIT') {
                console.log(`❌ FAILED: User B blocked by IP-based concurrency limit!`);
                console.log(`   Reason: ${errorData.reason}`);
                console.log(`   This means IP-based blocking is still active.\n`);
                process.exit(1);
            }
            throw new Error(`User B job failed: ${JSON.stringify(errorData)}`);
        }

        const job2Data = await job2Response.json();
        console.log(`✅ User B job created: ${job2Data.job_id}\n`);

        // Verify both jobs are in queue
        const status1 = await fetch(`${API_BASE}/api/status?session_id=${session1}`).then(r => r.json());
        const status2 = await fetch(`${API_BASE}/api/status?session_id=${session2}`).then(r => r.json());

        console.log('📊 Queue Status Check:');
        console.log(`User A: Position ${status1.user_position}, Job ID: ${status1.active_job_id}`);
        console.log(`User B: Position ${status2.user_position}, Job ID: ${status2.active_job_id}\n`);

        // Verify they have different jobs
        if (status1.active_job_id === job1Data.job_id && status2.active_job_id === job2Data.job_id) {
            console.log('✅ SUCCESS: Both users have independent jobs!');
            console.log('✅ IP-based blocking has been removed.');
            console.log('✅ Users from the same network can now generate simultaneously.\n');
        } else {
            console.log('❌ Job IDs do not match expected values');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testSameIpMultiUser();
