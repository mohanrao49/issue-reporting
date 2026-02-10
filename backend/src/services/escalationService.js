const Issue = require('../models/Issue');
const User = require('../models/User');
const notificationService = require('./notificationService');

/**
 * Escalation Service
 * Handles automatic escalation of complaints based on priority and time rules
 */

class EscalationService {
  /**
   * Check and escalate issues that have exceeded their time limits
   * This should be called periodically (e.g., every 15 minutes via cron job)
   */
  async checkAndEscalateIssues() {
    try {
      const now = new Date();
      console.log(`[ESCALATION] Checking for overdue issues at ${now.toISOString()}`);
      
      // Find all issues that have exceeded their deadline OR old issues without deadline set
      // Include 'reported' status so unaccepted issues can also escalate
      const overdueIssues = await Issue.find({
        status: { $in: ['reported', 'in-progress', 'escalated'] },
        $or: [
          // Issues assigned to field-staff or supervisor with deadline that has passed
          {
            assignedRole: { $in: ['field-staff', 'supervisor'], $ne: 'commissioner' },
            escalationDeadline: { $lte: now, $exists: true }
          },
          // Old issues without deadline - check if they're overdue based on creation time
          {
            escalationDeadline: { $exists: false },
            assignedRole: { $in: ['field-staff', 'supervisor'], $exists: true },
            assignedAt: { $exists: true }
          },
          // Very old issues from before deadline feature (5+ minutes old for testing)
          {
            escalationDeadline: null,
            assignedRole: { $in: ['field-staff', 'supervisor'], $exists: true },
            createdAt: { $lte: new Date(now.getTime() - 5 * 60 * 1000) }
          },
          // Old issues without assignedRole (from before role-based assignment)
          {
            assignedRole: { $exists: false },
            status: 'reported',
            createdAt: { $lte: new Date(now.getTime() - 5 * 60 * 1000) }
          }
        ]
      }).populate('assignedTo', 'name employeeId role departments department');

      console.log(`[ESCALATION] Found ${overdueIssues.length} overdue issues`);
      
      if (overdueIssues.length > 0) {
        console.log(`[ESCALATION] Overdue issues:`, overdueIssues.map(issue => ({
          id: issue._id,
          title: issue.title,
          status: issue.status,
          assignedRole: issue.assignedRole,
          deadline: issue.escalationDeadline,
          createdAt: issue.createdAt,
          assignedAt: issue.assignedAt,
          hasDeadline: !!issue.escalationDeadline,
          hoursOverdue: issue.escalationDeadline 
            ? Math.round((now - issue.escalationDeadline) / (1000 * 60 * 60))
            : Math.round((now - (issue.assignedAt || issue.createdAt)) / (1000 * 60 * 60))
        })));
      }

      const escalationResults = [];

      for (const issue of overdueIssues) {
        try {
          console.log(`[ESCALATION] Attempting to escalate issue ${issue._id} from ${issue.assignedRole}`);
          
          // For old issues without assignedRole, determine appropriate role based on age
          if (!issue.assignedRole) {
            console.log(`[ESCALATION] Issue ${issue._id} has no assignedRole. Determining appropriate role based on age.`);
            
            const issueAge = now - (issue.createdAt || now);
            const hoursOld = issueAge / (1000 * 60 * 60);
            const priority = issue.priority || 'medium';
            
            let targetRole = 'field-staff';
            
            // Determine which role this issue should be at based on its age and priority
            if (priority === 'high' || priority === 'urgent') {
              if (hoursOld >= 1/6) { // 5min + 5min = commissioner level (1/6 hour = 10 minutes)
                targetRole = 'commissioner';
              } else if (hoursOld >= 1/12) { // 5min = supervisor level (1/12 hour = 5 minutes)
                targetRole = 'supervisor';
              }
            } else if (priority === 'medium') {
              if (hoursOld >= 1/6) { // 5min + 5min = commissioner level (1/6 hour = 10 minutes)
                targetRole = 'commissioner';
              } else if (hoursOld >= 1/12) { // 5min = supervisor level (1/12 hour = 5 minutes)
                targetRole = 'supervisor';
              }
            } else { // low priority
              if (hoursOld >= 1/6) { // 5min + 5min = commissioner level (1/6 hour = 10 minutes)
                targetRole = 'commissioner';
              } else if (hoursOld >= 1/12) { // 5min = supervisor level (1/12 hour = 5 minutes)
                targetRole = 'supervisor';
              }
            }
            
            console.log(`[ESCALATION] Issue ${issue._id} is ${Math.round(hoursOld)}h old (${priority} priority). Assigning to ${targetRole}.`);
            
            // Assign to the appropriate role level
            if (targetRole === 'field-staff') {
              const fieldStaffResult = await this.assignToFieldStaff(issue);
              if (fieldStaffResult) {
                console.log(`[ESCALATION] ✅ Assigned issue ${issue._id} to field-staff`);
                escalationResults.push({
                  issueId: issue._id,
                  title: issue.title,
                  fromRole: 'unassigned',
                  toRole: 'field-staff',
                  success: true
                });
              }
            } else {
              // Escalate directly to supervisor or commissioner
              const targetUsers = await this.findAllUsersForRole(targetRole, issue.category);
              if (targetUsers && targetUsers.length > 0) {
                issue.assignedRole = targetRole;
                issue.assignedTo = targetUsers[0]._id;
                issue.assignedBy = targetUsers[0]._id;
                issue.assignedAt = new Date();
                issue.status = 'escalated';
                if (issue.priority) {
                  issue.escalationDeadline = issue.calculateEscalationDeadline(issue.priority, targetRole);
                }
                await issue.save();
                
                // Notify all users at target role
                const notificationPromises = targetUsers.map(user => 
                  notificationService.notifyIssueAssignment(issue, user, targetUsers[0])
                );
                await Promise.all(notificationPromises);
                
                console.log(`[ESCALATION] ✅ Fast-tracked issue ${issue._id} directly to ${targetRole}`);
                escalationResults.push({
                  issueId: issue._id,
                  title: issue.title,
                  fromRole: 'unassigned',
                  toRole: targetRole,
                  success: true
                });
              }
            }
            continue;
          }
          
          const result = await this.escalateIssue(issue);
          if (result) {
            console.log(`[ESCALATION] ✅ Successfully escalated issue ${issue._id} to ${result.toRole}`);
            escalationResults.push({
              issueId: issue._id,
              title: issue.title,
              fromRole: issue.assignedRole,
              toRole: result.toRole,
              success: true
            });
          }
        } catch (error) {
          console.error(`[ESCALATION] ❌ Error escalating issue ${issue._id}:`, error);
          escalationResults.push({
            issueId: issue._id,
            title: issue.title,
            success: false,
            error: error.message
          });
        }
      }

      return {
        checked: overdueIssues.length,
        escalated: escalationResults.filter(r => r.success).length,
        failed: escalationResults.filter(r => !r.success).length,
        results: escalationResults
      };
    } catch (error) {
      console.error('[ESCALATION] Error in checkAndEscalateIssues:', error);
      throw error;
    }
  }

  /**
   * Escalate a single issue to the next level
   */
  async escalateIssue(issue) {
    if (!issue.assignedRole) {
      // If no role assigned, assign to field-staff first
      return await this.assignToFieldStaff(issue);
    }

    const currentRole = issue.assignedRole;
    let nextRole = null;

    // Determine next role in hierarchy
    if (currentRole === 'field-staff') {
      nextRole = 'supervisor';
    } else if (currentRole === 'supervisor') {
      nextRole = 'commissioner';
    } else if (currentRole === 'commissioner') {
      // Cannot escalate further
      return null;
    }

    if (!nextRole) {
      return null;
    }

    // Find ALL users for the next role in this department
    const nextRoleUsers = await this.findAllUsersForRole(nextRole, issue.category);
    
    if (!nextRoleUsers || nextRoleUsers.length === 0) {
      console.warn(`No ${nextRole} found for category ${issue.category}`);
      return null;
    }

    // Pick the first user for assignment (load balancing can be improved later)
    const assignedUser = nextRoleUsers[0];

    // If issue doesn't have a deadline set (old issues), calculate it now based on time already elapsed
    if (!issue.escalationDeadline && issue.priority && currentRole) {
      console.log(`[ESCALATION] Issue ${issue._id} missing deadline. Setting deadline for ${currentRole} before escalation.`);
      const deadline = issue.calculateEscalationDeadline(issue.priority, currentRole);
      issue.escalationDeadline = deadline;
    }

    // Perform escalation
    await issue.escalate(nextRole, assignedUser._id, 'Auto-escalated: Time limit exceeded');

    // Update assignedTo (set to first user, but all users in that role will be notified)
    issue.assignedTo = assignedUser._id;
    issue.assignedBy = assignedUser._id;
    await issue.save();

    // Notify ALL users in the next role level
    const notificationPromises = nextRoleUsers.map(user => 
      notificationService.notifyIssueAssignment(issue, user, assignedUser)
    );
    await Promise.all(notificationPromises);

    console.log(`✅ Issue ${issue._id} escalated to ${nextRole}. ${nextRoleUsers.length} ${nextRole}(s) notified.`);

    return {
      toRole: nextRole,
      assignedTo: assignedUser._id,
      assignedUser: assignedUser.getProfile(),
      notifiedUsers: nextRoleUsers.length
    };
  }

  /**
   * Assign issue to field staff (initial assignment)
   */
  async assignToFieldStaff(issue) {
    const fieldStaff = await this.findUserForRole('field-staff', issue.category);
    
    if (!fieldStaff) {
      console.warn(`No field-staff found for category ${issue.category}`);
      return null;
    }

    const assignedRole = 'field-staff';
    await issue.assign(fieldStaff._id, fieldStaff._id, assignedRole);

    // Notify the assigned user
    await notificationService.notifyIssueAssignment(issue, fieldStaff, fieldStaff);

    return {
      toRole: assignedRole,
      assignedTo: fieldStaff._id,
      assignedUser: fieldStaff.getProfile()
    };
  }

  /**
   * Find appropriate user for a role and department
   */
  async findUserForRole(role, category) {
    // First, try to find user with matching department in departments array
    let user = await User.findOne({
      role,
      isActive: true,
      $or: [
        { departments: { $in: [category, 'All'] } },
        { department: { $in: [category, 'All'] } }
      ]
    }).sort({ loginCount: 1, lastLogin: -1 });

    // If not found, try without department filter (for 'All' departments)
    if (!user) {
      user = await User.findOne({
        role,
        isActive: true,
        $or: [
          { departments: 'All' },
          { department: 'All' }
        ]
      }).sort({ loginCount: 1, lastLogin: -1 });
    }

    // If still not found, get any active user with this role
    if (!user) {
      user = await User.findOne({
        role,
        isActive: true
      }).sort({ loginCount: 1, lastLogin: -1 });
    }

    return user;
  }

  /**
   * Find ALL users for a role and department (for escalation notifications)
   */
  async findAllUsersForRole(role, category) {
    // Find all users with matching department
    let users = await User.find({
      role,
      isActive: true,
      $or: [
        { departments: { $in: [category, 'All'] } },
        { department: { $in: [category, 'All'] } }
      ]
    }).sort({ loginCount: 1, lastLogin: -1 });

    // If none found, try 'All' departments only
    if (!users || users.length === 0) {
      users = await User.find({
        role,
        isActive: true,
        $or: [
          { departments: 'All' },
          { department: 'All' }
        ]
      }).sort({ loginCount: 1, lastLogin: -1 });
    }

    // If still none found, get any active users with this role
    if (!users || users.length === 0) {
      users = await User.find({
        role,
        isActive: true
      }).sort({ loginCount: 1, lastLogin: -1 });
    }

    return users;
  }

  /**
   * Get escalation timeline for an issue
   */
  async getEscalationTimeline(issueId) {
    const issue = await Issue.findById(issueId).populate('escalationHistory.escalatedBy', 'name employeeId role');
    
    if (!issue) {
      return null;
    }

    return {
      currentRole: issue.assignedRole,
      currentDeadline: issue.escalationDeadline,
      history: issue.escalationHistory,
      priority: issue.priority,
      status: issue.status
    };
  }

  /**
   * Manually escalate an issue (admin action)
   */
  async manualEscalate(issueId, toRole, escalatedBy, reason) {
    const issue = await Issue.findById(issueId);
    
    if (!issue) {
      throw new Error('Issue not found');
    }

    const assignedUser = await this.findUserForRole(toRole, issue.category);
    
    if (!assignedUser) {
      throw new Error(`No ${toRole} found for category ${issue.category}`);
    }

    await issue.escalate(toRole, escalatedBy, reason);
    issue.assignedTo = assignedUser._id;
    issue.assignedBy = escalatedBy;
    await issue.save();

    await notificationService.notifyIssueAssignment(issue, assignedUser, { _id: escalatedBy });

    return {
      issue,
      assignedUser: assignedUser.getProfile()
    };
  }
}

module.exports = new EscalationService();

