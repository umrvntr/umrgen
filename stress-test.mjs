import fs from 'fs';
import path from 'path';
import { setInterval } from 'timers/promises';

/**
 * UMRGEN Stress Test Toolkit v1.0.0
 * Purpose: Identify server capacity and bottlenecks through progressive load.
 */

const CONFIG = {
    TARGET_URL: 'http://localhost:3088',
    ENDPOINTS: {
        GENERATE: '/api/generate',
        STATUS: (jobId) => `/api/job/${jobId}/status`,
    },
    DEFAULT_PAYLOAD: {
        prompt: "stress test: a high quality futuristic terminal interface",
        negative: "blurry, low quality",
        width: 1024,
        height: 1024,
    },
    TEST_LEVELS: [1, 5, 10, 20, 30, 40, 50],
    DURATION_PER_LEVEL: 15000, // 15 seconds per level for quick auditing
    TIMEOUT: 30000,
    REPORT_FILE: 'STRESS_TEST_REPORT.md'
};

class StressTester {
    constructor() {
        this.results = [];
        this.currentLevel = 0;
        this.isActive = true;
    }

    generateSid() {
        return `sid_stress_${Math.random().toString(36).substring(2, 15)}`;
    }

    async sendRequest(level) {
        const start = Date.now();
        const sid = this.generateSid();
        const result = {
            level,
            latency: 0,
            status: 'pending',
            error: null,
            jobId: null
        };

        try {
            const response = await fetch(`${CONFIG.TARGET_URL}${CONFIG.ENDPOINTS.GENERATE}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...CONFIG.DEFAULT_PAYLOAD,
                    session_id: sid
                }),
                signal: AbortSignal.timeout(CONFIG.TIMEOUT)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            result.jobId = data.job_id;
            result.latency = Date.now() - start;
            result.status = 'success';

            // We don't wait for the full image generation in this stress test
            // as we are testing the API's ability to handle concurrent intake/queueing.
        } catch (err) {
            result.status = 'failed';
            result.error = err.message;
            result.latency = Date.now() - start;
        }

        return result;
    }

    async runLevel(concurrency) {
        console.log(`\n[TEST] Level: ${concurrency} concurrent requests...`);
        const levelStartTime = Date.now();
        const levelResults = [];

        // Simulate concurrent batch
        const batch = Array.from({ length: concurrency }, () => this.sendRequest(concurrency));
        const finished = await Promise.all(batch);

        levelResults.push(...finished);

        // Print mini-report for level
        const success = finished.filter(r => r.status === 'success').length;
        const avgLatency = finished.reduce((acc, r) => acc + r.latency, 0) / finished.length;
        console.log(`      Success: ${success}/${concurrency} | Avg Intake Latency: ${avgLatency.toFixed(2)}ms`);

        return levelResults;
    }

    async start() {
        console.clear();
        console.log("========================================");
        console.log("   UMRGEN STRESS TEST TOOLKIT v1.0.0");
        console.log("========================================\n");
        console.log(`Target: ${CONFIG.TARGET_URL}`);

        // Initial check
        try {
            const check = await fetch(CONFIG.TARGET_URL);
            if (!check.ok) throw new Error("Server not responding");
            console.log("[OK] Server reachable.\n");
        } catch (e) {
            console.error("[ERROR] Cannot reach server. Ensure npm run dev:server is active.");
            return;
        }

        for (const level of CONFIG.TEST_LEVELS) {
            const levelResults = await this.runLevel(level);
            this.results.push(...levelResults);

            const failures = levelResults.filter(r => r.status === 'failed').length;
            if (failures > level / 2) {
                console.warn("\n[CRITICAL] High failure rate detected. Stopping test for safety.");
                break;
            }

            // Small breather
            await new Promise(r => setTimeout(r, 2000));
        }

        this.generateReport();
    }

    generateReport() {
        console.log("\n[REPORT] Analyzing result data...");

        const summaryByLevel = CONFIG.TEST_LEVELS.map(level => {
            const levelData = this.results.filter(r => r.level === level);
            if (levelData.length === 0) return null;

            const success = levelData.filter(r => r.status === 'success').length;
            const failed = levelData.filter(r => r.status === 'failed').length;
            const latencies = levelData.map(r => r.latency).sort((a, b) => a - b);
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const p95 = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1];

            return { level, success, failed, avg, p95 };
        }).filter(Boolean);

        let markdown = `# UMRGEN Stress Test Audit Report\n\n`;
        markdown += `Generated on: ${new Date().toLocaleString()}\n\n`;

        markdown += `## Executive Summary\n`;
        const capacity = summaryByLevel.find(s => s.failed > 0)?.level || CONFIG.TEST_LEVELS[CONFIG.TEST_LEVELS.length - 1];
        markdown += `**Operational Capacity**: The server safely handles up to **${capacity}** concurrent intakes.\n\n`;

        markdown += `## Metrics Table\n\n`;
        markdown += `| Concurrency | Success Rate | Avg Latency | P95 Latency | Status |\n`;
        markdown += `|-------------|--------------|-------------|-------------|--------|\n`;

        summaryByLevel.forEach(s => {
            const rate = ((s.success / s.level) * 100).toFixed(0);
            const status = s.failed === 0 ? "✅ PASS" : "⚠️ DEGRADED";
            markdown += `| ${s.level} | ${rate}% | ${s.avg.toFixed(2)}ms | ${s.p95.toFixed(2)}ms | ${status} |\n`;
        });

        markdown += `\n## Latency Visualization (Avg)\n\n\`\`\`text\n`;
        const maxAvg = Math.max(...summaryByLevel.map(s => s.avg));
        summaryByLevel.forEach(s => {
            const barLen = Math.round((s.avg / maxAvg) * 30);
            markdown += `${String(s.level).padStart(3)} [${'#'.repeat(barLen).padEnd(30)}] ${s.avg.toFixed(2)}ms\n`;
        });
        markdown += `\`\`\`\n\n## Recommendations\n`;
        markdown += `- Threshold for bottleneck: ${capacity} users.\n`;
        markdown += `- If deploying for more than ${capacity} active users, consider horizontal scaling of the intake workers.\n`;

        fs.writeFileSync(CONFIG.REPORT_FILE, markdown);
        console.log(`\n[OK] Audit complete. Report saved to: ${CONFIG.REPORT_FILE}`);
    }
}

const tester = new StressTester();
tester.start();
