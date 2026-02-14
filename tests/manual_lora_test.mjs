import fetch from 'node-fetch';

async function testLoRA() {
    const payload = {
        prompt: "A beautiful scenery, high quality",
        session_id: "sid_test_lora_debug",
        loras: [
            {
                name: "V8",
                filename: "V8.safetensors",
                strength_model: 1.0,
                strength_clip: 1.0
            }
        ]
    };

    console.log("Sending test request to server...");
    try {
        const res = await fetch('http://localhost:3088/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log("Response:", JSON.stringify(data, null, 2));

        if (data.job_id) {
            console.log(`Job created: ${data.job_id}. Check terminal logs for LoRA injection confirmation.`);
        }
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

testLoRA();
