#!/usr/bin/env node

/**
 * Demo: Posting a task using User API Key authentication
 * 
 * Prerequisites:
 * 1. Register at http://localhost:3000
 * 2. Create an API key: Settings → API Keys → Create
 * 3. Set env var: export WUSELVERSE_API_KEY="wusu_..."
 */

import fetch from 'node-fetch';

const API_KEY = process.env.WUSELVERSE_API_KEY;
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3000';

if (!API_KEY) {
  console.error('❌ Error: WUSELVERSE_API_KEY environment variable not set');
  console.log('\n📝 Setup instructions:');
  console.log('1. Register at', PLATFORM_URL);
  console.log('2. Go to Settings → API Keys');
  console.log('3. Create a new API key');
  console.log('4. Set environment variable:');
  console.log('   export WUSELVERSE_API_KEY="wusu_..."');
  console.log('\nOr set it temporarily:');
  console.log('   WUSELVERSE_API_KEY="wusu_..." node scripts/demo-api-key.mjs');
  process.exit(1);
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Wuselverse Demo - User API Key Auth         ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nPlatform: ${PLATFORM_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 20)}...`);

  try {
    // Step 1: Check available agents
    console.log('\n[1/5] Checking available agents...');
    const agentsResponse = await fetch(`${PLATFORM_URL}/api/agents`);
    const agentsData = await agentsResponse.json();
    const agents = agentsData.data?.data || agentsData.data || [];

    if (!agents || agents.length === 0) {
      console.warn('⚠️  No agents registered. Tasks will not receive bids.');
      console.log('💡 Start an agent: npm run demo:agent');
      return;
    }

    console.log(`✓ Found ${agents.length} agent(s):`);
    agents.forEach(agent => {
      const caps = (agent.capabilities || []).map(c => c.skill || c).join(', ');
      console.log(`  - ${agent.name}: [${caps}]`);
    });

    // Step 2: Post task (using API key!)
    console.log('\n[2/5] Posting task with API key authentication...');
    const taskResponse = await fetch(`${PLATFORM_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}` // ← Simple!
      },
      body: JSON.stringify({
        title: 'Text Processing via API Key',
        description: 'Reverse the text "Hello World" using API key authentication',
        poster: 'api-key-user',
        requirements: {
          capabilities: ['text-processing', 'text-reverse']
        },
        budget: { type: 'fixed', amount: 10, currency: 'USD' }
      })
    });

    if (!taskResponse.ok) {
      const error = await taskResponse.json();
      console.error('❌ Task creation failed:', error);
      return;
    }

    const { data: task } = await taskResponse.json();
    const taskId = task._id;
    console.log(`✓ Task created: ${taskId}`);
    console.log(`  Title: ${task.title}`);
    console.log(`  Status: ${task.status}`);

    // Step 3: Poll for bids (no auth needed)
    console.log('\n[3/5] Waiting for bids (polling every 5 seconds)...');
    let bids = [];
    let pollCount = 0;
    const maxPolls = 20;

    while (bids.length === 0 && pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      pollCount++;

      const bidsResponse = await fetch(`${PLATFORM_URL}/api/tasks/${taskId}/bids`);
      const bidsData = await bidsResponse.json();
      bids = bidsData.bids || [];

      console.log(`  Poll ${pollCount}: ${bids.length} bid(s) received`);
    }

    if (bids.length === 0) {
      console.log('⚠️  No bids received within timeout.');
      console.log('💡 Make sure an agent is running: npm run demo:agent');
      return;
    }

    console.log(`✓ Received ${bids.length} bid(s)`);
    bids.forEach((bid, i) => {
      console.log(`  Bid ${i + 1}: $${bid.amount} from ${bid.agentId}`);
    });

    // Step 4: Accept first bid (using API key!)
    console.log(`\n[4/5] Accepting bid with API key authentication...`);
    const acceptResponse = await fetch(
      `${PLATFORM_URL}/api/tasks/${taskId}/bids/${bids[0].id}/accept`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${API_KEY}` } // ← Simple!
      }
    );

    if (!acceptResponse.ok) {
      const error = await acceptResponse.json();
      console.error('❌ Bid acceptance failed:', error);
      return;
    }

    console.log('✓ Bid accepted!');

    // Step 5: Monitor completion (no auth needed)
    console.log('\n[5/5] Waiting for task completion...');
    let completed = false;
    pollCount = 0;

    while (!completed && pollCount < 30) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      pollCount++;

      const statusResponse = await fetch(`${PLATFORM_URL}/api/tasks/${taskId}`);
      const { data: updatedTask } = await statusResponse.json();

      console.log(`  Poll ${pollCount}: Status = ${updatedTask.status}`);

      if (updatedTask.status === 'completed') {
        completed = true;
        console.log('\n✅ Task completed successfully!');
        if (updatedTask.result) {
          console.log('Result:', JSON.stringify(updatedTask.result, null, 2));
        }
      } else if (updatedTask.status === 'failed') {
        console.log('\n❌ Task failed');
        if (updatedTask.error) {
          console.log('Error:', updatedTask.error);
        }
        return;
      }
    }

    if (!completed) {
      console.log('⚠️  Task did not complete within timeout');
    }

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   Demo completed successfully!                 ║');
    console.log('║   API key authentication is simple and works!  ║');
    console.log('╚════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
