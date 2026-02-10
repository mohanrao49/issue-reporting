/**
 * Test script to verify escalation functionality with reduced time limits
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Issue = require('./src/models/Issue');
const User = require('./src/models/User');
const escalationService = require('./src/services/escalationService');

async function testEscalation() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/civic_connect');
    console.log('Connected to database');

    // Check for any existing issues that might be ready for escalation
    console.log('\n--- Checking for issues ready for escalation ---');
    const result = await escalationService.checkAndEscalateIssues();
    console.log('Escalation check result:', result);

    // Show current issues
    console.log('\n--- Current issues in the system ---');
    const allIssues = await Issue.find({}).sort({ createdAt: -1 }).limit(10);
    for (const issue of allIssues) {
      console.log({
        id: issue._id,
        title: issue.title,
        status: issue.status,
        assignedRole: issue.assignedRole,
        priority: issue.priority,
        category: issue.category,
        escalationDeadline: issue.escalationDeadline,
        createdAt: issue.createdAt,
        assignedAt: issue.assignedAt
      });
    }

    // Show current users
    console.log('\n--- Current employees ---');
    const employees = await User.find({ role: { $in: ['field-staff', 'supervisor', 'commissioner'] } });
    for (const emp of employees) {
      console.log({
        id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        role: emp.role,
        department: emp.department,
        departments: emp.departments
      });
    }

    console.log('\n--- Testing Instructions ---');
    console.log('1. Create a new issue with any priority level');
    console.log('2. Wait 1 minute for it to appear in field-staff dashboard (if assigned to field-staff)');
    console.log('3. Wait another minute for it to escalate to supervisor level');
    console.log('4. Wait another minute for it to escalate to commissioner level');
    console.log('5. The escalation job runs every minute now for testing');
    console.log('6. Check employee dashboards to see the escalation in real-time');

  } catch (error) {
    console.error('Error in test:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testEscalation();