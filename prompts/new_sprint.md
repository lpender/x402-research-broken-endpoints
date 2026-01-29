Sprint 3 description:

Now that we've got the infrastructure in place, we need to move to using 'real'
money in Base Defi yield optimizer.  The private keys for EVM and Solana are in
the .env file. We need to run the test with real endpoints and see the
difference.

Instructions:

Create a PRD (Product Requirements Document) system for this sprint:

STEP 1 - COLLABORATIVE PLANNING:
Work with me interactively to define:
- Sprint goals and requirements
- User stories and acceptance criteria
- Technical approach and architecture decisions
- Task breakdown and dependencies

STEP 2 - GENERATE ARTIFACTS:
Once we finalize the plan, create:

`PRD.md` - Full requirements document including:
- Executive summary
- Problem/solution overview
- Detailed requirements
- Technical specifications
- Success criteria

`prd-items.json` - Structured task list:
```json
[
{
  "items": [
    {
      "id": "YIELD-001",
      "category": "yield-agent",
      "description": "Example task to create YieldOptimizerAgent class that runs multi-step DeFi optimization cycle",
      "steps_to_verify": [
        "File src/yield-agent.ts exists",
        "Class exports YieldOptimizerAgent",
        "runOptimizationCycle() returns OptimizationResult with poolData, whaleData, sentimentData, allocation",
        "Constructor accepts mode ('no-zauth' | 'with-zauth') and clients"
      ],
      "passes": true
    }
  ]
]
```

STEP 3 - ARCHIVE ON COMPLETION:
When all tasks are complete, archive the sprint:
```bash
# Determine next sprint number
NEXT=$(ls sprints/ | grep -E '^[0-9]+$' | sort -n | tail -1 | awk '{print $1+1}')
mkdir -p sprints/${NEXT:-1}
mv PRD.md prd-items.json sprints/${NEXT:-1}/
```

Note: Don't execute the PRD tasks automatically—just create the planning documents.
