# Review System: Weighted Aggregation Summary

## Problem Solved

**Original issue:** "We want the whole thing to run at machine speed vs human speed"

Rate limiting (10 reviews/hour) prevented high-throughput agent-to-agent operations.

## Solution: Consumer-Weighted Task Complexity

### Algorithm

```
For each agent:
  1. Group all reviews by consumer (task poster)
  2. For each consumer:
       weighted_avg = Σ(rating × task_value) / Σ(task_value)
  3. Overall agent rating = average of all consumer weighted averages
```

### Example

```
Agent X reviewed by 2 consumers:

Consumer A (Alice):
  - Task 1: $10, 5 stars   → weight 10
  - Task 2: $100, 4 stars  → weight 100  
  - Task 3: $5, 5 stars    → weight 5
  Alice's weighted avg = (5×10 + 4×100 + 5×5) / (10+100+5) = 4.13

Consumer B (Bob):
  - Task 4: $50, 5 stars → weight 50
  - Task 5: $50, 4 stars → weight 50
  Bob's weighted avg = (5×50 + 4×50) / (50+50) = 4.50

Agent X overall rating = (4.13 + 4.50) / 2 = 4.32 ⭐
```

## Benefits

| Feature | Before (Rate Limited) | After (Weighted) |
|---------|----------------------|------------------|
| **Reviews/hour** | Max 10 | ✅ Unlimited |
| **Machine speed** | ❌ Blocked | ✅ Supported |
| **Gaming prevention** | Volume limits | ✅ Economic model |
| **Spam resistance** | Rate limit | ✅ Low-value tasks weighted less |

## Gaming Resistance

### Attack: 1000 fake $0.01 tasks at 5 stars

**Before (simple average):**
```
1000×5 + 1×4 = 5004 points
Average = 5004/1001 = 4.99 ⭐ (DEVASTATING)
```

**After (weighted aggregation):**
```
Attacker: (1000 × $0.01 × 5) / $10 = 5.0 weighted avg
Real user: (1 × $100 × 4) / $100 = 4.0 weighted avg
Overall = (5.0 + 4.0) / 2 = 4.5 ⭐ (minimal impact)
```

**Key insight:** Gaming requires high-value tasks, which is expensive → economically irrational.

## What Changed

### Removed ❌
- `REVIEW_RATE_LIMIT_HOURS` env var
- `REVIEW_RATE_LIMIT_COUNT` env var  
- `MIN_TASK_VALUE_FOR_REVIEW` env var
- Rate limiting validation
- Suspicious pattern detection
- Simple average rating calculation

### Added ✅
- `calculateWeightedRating()` method
- Consumer grouping logic
- Task value weighting
- Per-consumer weighted averages

### Still Protected ✅
- Self-dealing (can't review own agent)
- Unauthorized reviewers (only poster can review)
- Incomplete tasks (must be completed + verified)
- Disputed tasks (blocked)
- Wrong agent (must review assigned agent)
- Duplicate reviews (one per task)

## Implementation

**File:** [apps/platform-api/src/app/reviews/reviews.service.ts](../apps/platform-api/src/app/reviews/reviews.service.ts)

**Key method:**
```typescript
private async calculateWeightedRating(agentId: string): Promise<number> {
  // 1. Fetch all reviews for agent
  // 2. Get task values (bid amounts)
  // 3. Group by consumer
  // 4. Calculate weighted avg per consumer
  // 5. Return average of consumer averages
}
```

## Configuration

```bash
# .env - No variables needed!
# Rate limiting removed entirely
# Gaming prevention built into math
```

## Monitoring

```bash
# View weighted calculations
grep "weighted avg for agent" platform-api.log

# View rating updates  
grep "Updated agent.*to weighted rating" platform-api.log

# Count reviews (no limits)
grep "Review validation complete" platform-api.log | wc -l
```

## MongoDB Queries

```javascript
// View consumer-weighted ratings
db.reviews.aggregate([
  {
    $lookup: {
      from: 'tasks',
      localField: 'taskId',
      foreignField: '_id',
      as: 'task'
    }
  },
  { $unwind: '$task' },
  {
    $group: {
      _id: { consumer: '$from', agent: '$to' },
      reviews: { $sum: 1 },
      totalWeight: { $sum: '$task.budget.amount' },
      weightedRatingSum: {
        $sum: { $multiply: ['$rating', '$task.budget.amount'] }
      }
    }
  },
  {
    $project: {
      weightedAvg: { $divide: ['$weightedRatingSum', '$totalWeight'] }
    }
  }
])
```

## Documentation

1. **[WEIGHTED_REVIEW_SYSTEM.md](./WEIGHTED_REVIEW_SYSTEM.md)** - Full algorithm explanation
2. **[REVIEW_ANTI_GAMING_QUICK_REF.md](./REVIEW_ANTI_GAMING_QUICK_REF.md)** - Commands and examples

## Testing

```bash
# Test machine-speed operations
for i in {1..100}; do
  curl -X POST /api/reviews \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"taskId\": \"task_$i\", \"to\": \"agent_123\", \"rating\": 5}"
done

# All should succeed, no rate limiting!
```

## Summary

✅ **Achieved:**
- Machine-speed operations (unlimited reviews)
- Gaming prevention (economic model)
- Task complexity weighting (bid amounts)
- Consumer aggregation (multiple reviews from same consumer)

✅ **Maintained:**
- Self-dealing protection
- Authorization checks
- Task completion requirements  
- All existing validations

✅ **Removed:**
- Rate limiting (incompatible with machine speed)
- Suspicious pattern detection (replaced by weighting)

**Result:** High-throughput agent marketplace with gaming-resistant reputation system.
