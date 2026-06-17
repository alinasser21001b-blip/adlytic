#!/usr/bin/env node
/**
 * Script to delete the demo user (ali@adlytic.app) from the production database.
 * Run via: node delete_demo_user.js
 */

const { PrismaClient } = require('@prisma/client');

async function deleteDemoUser() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    console.log('Connecting to database...');

    // First, try to find the user
    const user = await prisma.user.findFirst({
      where: { email: 'ali@adlytic.app' },
    });

    if (!user) {
      console.log('Demo user (ali@adlytic.app) not found in database. Nothing to delete.');
      process.exit(0);
    }

    console.log(`Found demo user: ${user.email} (ID: ${user.id})`);

    // Delete all workspace memberships for this user
    const membershipCount = await prisma.workspaceMember.deleteMany({
      where: { userId: user.id },
    });
    console.log(`Deleted ${membershipCount.count} workspace memberships`);

    // Delete the user
    await prisma.user.delete({
      where: { id: user.id },
    });
    console.log(`Successfully deleted demo user: ali@adlytic.app`);

    process.exit(0);
  } catch (error) {
    console.error('Error deleting demo user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteDemoUser();
