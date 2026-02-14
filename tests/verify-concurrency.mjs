import fetch from 'node-fetch';

const TARGET = 'http://localhost:3088/api/generate';
const sessionId1 = 'sid_tester_concurrency_1';
const sessionId2 = 'sid_tester_concurrency_2';

async function testConcurrency() {
    console.log('Testing IP Concurrency Protection...');

    const payload = {
        prompt: "A peaceful forest with a small stream",
        negative: "people, city",
        width: 1024,
        height: 1024,
    };

    try {
        // 1. Fire first request
        console.log(`Sending first request (Session: ${sessionId1})...`);
        const resp1 = await fetch(TARGET, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, session_id: sessionId1 })
        });

        if (!resp1.ok) {
            const err = await resp1.json();
            console.error('FAIL: First request should have been accepted.', err);
            process.exit(1);
        }
        console.log('SUCCESS: First request accepted.');

        // 2. Fire second request (Same IP, different Session)
        console.log(`Sending second request (Session: ${sessionId2})...`);
        const resp2 = await fetch(TARGET, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, session_id: sessionId2 })
        });

        if (resp2.status === 429) {
            const data = await resp2.json();
            console.log('SUCCESS: Second request blocked as expected (429).');
            console.log('Response:', data);
            process.exit(0);
        } else {
            console.error(`FAIL: Second request should be blocked (Expected 429, got ${resp2.status}).`);
            process.exit(1);
        }
    } catch (e) {
        console.error('ERROR during test:', e.message);
        process.exit(1);
    }
}

testConcurrency();
