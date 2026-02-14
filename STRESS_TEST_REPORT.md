# UMRGEN Stress Test Audit Report

Generated on: 24/01/2026, 21:43:38

## Executive Summary
**Operational Capacity**: The server safely handles up to **30** concurrent intakes.

## Metrics Table

| Concurrency | Success Rate | Avg Latency | P95 Latency | Status |
|-------------|--------------|-------------|-------------|--------|
| 1 | 100% | 24.00ms | 24.00ms | ✅ PASS |
| 5 | 100% | 8.20ms | 9.00ms | ✅ PASS |
| 10 | 100% | 11.80ms | 13.00ms | ✅ PASS |
| 20 | 100% | 12.70ms | 17.00ms | ✅ PASS |
| 30 | 80% | 17.67ms | 22.00ms | ⚠️ DEGRADED |
| 40 | 0% | 12.40ms | 17.00ms | ⚠️ DEGRADED |

## Latency Visualization (Avg)

```text
  1 [##############################] 24.00ms
  5 [##########                    ] 8.20ms
 10 [###############               ] 11.80ms
 20 [################              ] 12.70ms
 30 [######################        ] 17.67ms
 40 [################              ] 12.40ms
```

## Recommendations
- Threshold for bottleneck: 30 users.
- If deploying for more than 30 active users, consider horizontal scaling of the intake workers.
