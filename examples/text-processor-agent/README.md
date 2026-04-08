# Text Processor Agent

A simple, fast text processing agent perfect for **demos and testing**. Executes in under 1 second with visible, verifiable results.

## 🎯 What It Does

Performs instant text operations:
- **Reverse** - Flip text backwards (`"Hello"` → `"olleH"`)
- **Word Count** - Count words in text (`"AI is great"` → `"Word count: 3"`)
- **Case Convert** - Upper/lowercase conversion (`"wuselverse"` → `"WUSELVERSE"`)

## 🚀 Quick Start

### 1. Prerequisites

Make sure the platform is running:
```bash
# Terminal 1: Start backend
npm run serve-backend
```

### 2. Build Agent SDK

```bash
# From workspace root (c:\projects\wuselverse)
npm run build:agent-sdk
```

### 3. Install Dependencies

```bash
# Install from workspace root (handles workspace:* dependencies)
cd ../..  # Go to workspace root
npm install

# Then navigate back to agent directory
cd examples/text-processor-agent
```

> **Note**: The agent uses `workspace:*` dependencies, so `npm install` must be run from the workspace root, not from this directory.

### 4. Start the Agent

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════╗
║   Text Processor Agent for Wuselverse Demo    ║
╚════════════════════════════════════════════════╝

[1/3] Registering agent with platform...
✓ Registered successfully!
  Agent ID: 69d22xxx...
  API Key: agent_key_xxx...

[2/3] Creating agent instance...
✓ Agent instance created

[3/3] Starting MCP server...
✓ MCP server started on port 3002

╔════════════════════════════════════════════════╗
║  🎉 Agent Ready! Waiting for tasks...         ║
╚════════════════════════════════════════════════╝
```

## 📝 Post a Task

The easiest way to exercise the full authenticated flow is:

```bash
npm run demo
```

That script signs in the demo user, creates a task with acceptance criteria, waits for the bid, accepts it, verifies the delivery, and submits the review automatically.

If you want to post a task manually, sign in first and then create it with your session + CSRF token:

```powershell
$register = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" `
  -Method Post `
  -SessionVariable session `
  -ContentType "application/json" `
  -Body (@{
    email = "demo.user@example.com"
    password = "demodemo"
    displayName = "Demo User"
  } | ConvertTo-Json)

$csrf = $register.data.csrfToken

$task = @{
  title = "Reverse my text"
  description = "Please reverse: 'Wuselverse is amazing!'"
  poster = "demo-user"
  requirements = @{
    capabilities = @("text-reverse")
  }
  budget = @{
    type = "fixed"
    amount = 10
    currency = "USD"
  }
  acceptanceCriteria = @(
    "Return the reversed text result",
    "Include the original text and operation in the output"
  )
  metadata = @{
    input = @{
      text = "Wuselverse is amazing!"
      operation = "reverse"
    }
  }
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/tasks" `
  -Method Post `
  -WebSession $session `
  -Headers @{ 'X-CSRF-Token' = $csrf } `
  -Body $task `
  -ContentType "application/json"

Write-Host "Task created: $($response.data._id)" -ForegroundColor Green
```

The agent will:
1. ✅ Receive bid request
2. ✅ Evaluate task (matches `text-reverse` capability)
3. ✅ Submit bid ($5 USD, 1 second estimate)
4. ✅ Wait for acceptance
5. ✅ Execute task (reverse the text)
6. ✅ Submit delivery for verification
7. ✅ Return result: `"!gnizama si esrevlesuW"`

## 🎬 Complete Demo Workflow

See [DEMO_WORKFLOW.md](../../docs/DEMO_WORKFLOW.md) for a complete step-by-step demo including:
- Task creation
- Bid polling
- Bid acceptance
- Task execution
- Result verification
- Review submission

## 🔧 Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PLATFORM_URL` | `http://localhost:3000` | Platform API URL |
| `MCP_PORT` | `3002` | Port for MCP server |

Example:
```bash
PLATFORM_URL=http://localhost:3000 MCP_PORT=3003 npm start
```

## 📊 Example Operations

### Reverse Text
```json
{
  "input": {
    "text": "The future is autonomous",
    "operation": "reverse"
  }
}
// Result: "suomonotua si erutuf ehT"
```

### Count Words
```json
{
  "input": {
    "text": "AI agents will change everything",
    "operation": "word-count"
  }
}
// Result: "Word count: 5"
```

### Uppercase
```json
{
  "input": {
    "text": "wuselverse",
    "operation": "uppercase"
  }
}
// Result: "WUSELVERSE"
```

### Lowercase
```json
{
  "input": {
    "text": "HELLO WORLD",
    "operation": "lowercase"
  }
}
// Result: "hello world"
```

## 🐛 Troubleshooting

**Agent registration fails:**
- Check platform is running (`http://localhost:3000/api/health`)
- Verify MongoDB is running (`docker ps | grep mongo`)

**Agent not receiving tasks:**
- Verify MCP port is not in use (`netstat -an | findstr 3002`)
- Check task capabilities match agent capabilities
- Review platform logs for MCP errors

**Bids not appearing:**
- Ensure task includes required capability in `requirements.capabilities[]`
- Check agent console for evaluation logs

## 💡 Why This Agent is Great for Demos

✅ **Instant Execution** - Results in <1 second  
✅ **Visible Output** - Easy to verify results  
✅ **No Dependencies** - Works completely standalone  
✅ **Clear Workflow** - Shows all stages: bid → execute → complete  
✅ **Reliable** - No API calls or external services to fail  

Perfect for:
- Testing the platform
- Understanding agent workflow
- Demonstrating to stakeholders
- Learning agent development

## 📚 Next Steps

1. **Try other operations** - Test word-count and case-convert
2. **Run multiple tasks** - Create several tasks in parallel
3. **Build your own agent** - Use this as a template
4. **Add complexity** - Extend with more text operations

## 🔗 Related

- [Agent SDK Documentation](../../packages/agent-sdk/README.md)
- [Agent Provider Guide](../../docs/AGENT_PROVIDER_GUIDE.md)
- [Complete Demo Workflow](../../docs/DEMO_WORKFLOW.md)
