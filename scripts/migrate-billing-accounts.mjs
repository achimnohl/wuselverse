#!/usr/bin/env node
/**
 * Migration Script: Add Billing Accounts to Existing Users
 * 
 * This script:
 * 1. Creates personal billing accounts for all existing users
 * 2. Links users to their billing accounts (billingAccountId field)
 * 3. Links agents to their owner's billing accounts
 * 4. Backfills existing transactions with settlement periods based on creation date
 * 
 * Usage: node scripts/migrate-billing-accounts.mjs
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse';

// Utility function to format settlement period (YYYY-MM)
function getSettlementPeriod(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function migrate() {
  console.log('🚀 Starting billing account migration...\n');

  try {
    // Connect to MongoDB
    console.log(`📡 Connecting to MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Step 1: Create billing accounts for all users
    console.log('📊 Step 1: Creating billing accounts for users...');
    const usersCollection = db.collection('users');
    const billingAccountsCollection = db.collection('billingaccounts');

    const users = await usersCollection.find({ billingAccountId: { $exists: false } }).toArray();
    console.log(`Found ${users.length} users without billing accounts`);

    let createdAccounts = 0;
    for (const user of users) {
      // Create billing account
      const billingAccount = {
        name: `${user.username || user.email}'s Account`,
        type: 'individual',
        ownerId: user._id.toString(),
        balance: 0,
        settings: {
          settlementSchedule: 'monthly',
          currency: 'USD'
        },
        taxInfo: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await billingAccountsCollection.insertOne(billingAccount);
      const accountId = result.insertedId.toString();

      // Update user with billing account ID
      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            billingAccountId: accountId,
            billingRole: 'owner',
            updatedAt: new Date()
          }
        }
      );

      createdAccounts++;
      if (createdAccounts % 10 === 0) {
        console.log(`  Created ${createdAccounts}/${users.length} accounts...`);
      }
    }
    console.log(`✅ Created ${createdAccounts} billing accounts\n`);

    // Step 2: Link agents to their owner's billing accounts
    console.log('📊 Step 2: Linking agents to billing accounts...');
    const agentsCollection = db.collection('agents');

    const agents = await agentsCollection.find({ billingAccountId: { $exists: false } }).toArray();
    console.log(`Found ${agents.length} agents without billing accounts`);

    let linkedAgents = 0;
    for (const agent of agents) {
      // Find the owner's billing account
      const owner = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(agent.ownerId) });
      
      if (owner && owner.billingAccountId) {
        await agentsCollection.updateOne(
          { _id: agent._id },
          {
            $set: {
              billingAccountId: owner.billingAccountId,
              updatedAt: new Date()
            }
          }
        );
        linkedAgents++;

        if (linkedAgents % 10 === 0) {
          console.log(`  Linked ${linkedAgents}/${agents.length} agents...`);
        }
      } else {
        console.warn(`  ⚠️  Could not find billing account for agent ${agent._id} (owner: ${agent.ownerId})`);
      }
    }
    console.log(`✅ Linked ${linkedAgents} agents to billing accounts\n`);

    // Step 3: Backfill settlement periods for existing transactions
    console.log('📊 Step 3: Backfilling settlement periods for transactions...');
    const transactionsCollection = db.collection('transactions');

    const transactions = await transactionsCollection.find({ 
      settlementPeriod: { $exists: false } 
    }).toArray();
    console.log(`Found ${transactions.length} transactions without settlement periods`);

    let updatedTransactions = 0;
    for (const tx of transactions) {
      const createdAt = tx.createdAt || new Date();
      const settlementPeriod = getSettlementPeriod(createdAt);
      
      // Determine settlement status based on transaction type
      let settlementStatus = 'pending';
      if (tx.type === 'escrow_lock') {
        settlementStatus = 'settled'; // Escrow locks are immediately settled
      } else if (tx.status === 'completed') {
        settlementStatus = 'settled'; // Legacy completed transactions considered settled
      }

      // Try to link to billing accounts based on user IDs
      const updateFields = {
        settlementPeriod,
        settlementStatus,
        updatedAt: new Date()
      };

      // Link sender to billing account
      if (tx.from) {
        const sender = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(tx.from) });
        if (sender && sender.billingAccountId) {
          updateFields.fromAccountId = sender.billingAccountId;
        }
      }

      // Link recipient to billing account
      if (tx.to) {
        const recipient = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(tx.to) });
        if (recipient && recipient.billingAccountId) {
          updateFields.toAccountId = recipient.billingAccountId;
        }
      }

      await transactionsCollection.updateOne(
        { _id: tx._id },
        { $set: updateFields }
      );

      updatedTransactions++;
      if (updatedTransactions % 100 === 0) {
        console.log(`  Updated ${updatedTransactions}/${transactions.length} transactions...`);
      }
    }
    console.log(`✅ Updated ${updatedTransactions} transactions\n`);

    // Summary
    console.log('📋 Migration Summary:');
    console.log(`   Billing Accounts Created: ${createdAccounts}`);
    console.log(`   Agents Linked: ${linkedAgents}`);
    console.log(`   Transactions Updated: ${updatedTransactions}`);
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run migration
migrate();
