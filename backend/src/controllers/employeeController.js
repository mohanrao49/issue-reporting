const Issue = require('../models/Issue');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

class EmployeeController {
  async listAssignedIssues(req, res) {
    try {
      const { page = 1, limit = 50, status, category, priority } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const user = req.user;
      const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
      
      // Build filter based on role
      const filter = {};

      if (employeeRoles.includes(user.role)) {
        // Get user's departments
        const userDepartments = user.departments && user.departments.length > 0 
          ? user.departments 
          : (user.department ? [user.department] : []);
        
        const hasAllDepartments = userDepartments.includes('All');
        
        // Field Staff: ONLY see issues where assignedRole is 'field-staff'
        if (user.role === 'field-staff' || user.role === 'employee') {
          // Show issues that are:
          // 1. Assigned specifically to this user, OR
          // 2. Assigned to field-staff role (assignedRole = 'field-staff') and match user's department
          const baseCondition = {
            assignedRole: 'field-staff',
            $or: [
              { assignedTo: null },
              { assignedTo: { $exists: false } }
            ]
          };
          
          // Add department filter only if user doesn't have 'All'
          if (!hasAllDepartments && userDepartments.length > 0) {
            baseCondition.category = { $in: userDepartments };
          }
          
          filter.$or = [
            { assignedTo: user._id }, // Specifically assigned to this user
            baseCondition
          ];
        }
        // Supervisor: ONLY see issues where assignedRole is 'supervisor' (escalated to supervisor level)
        else if (user.role === 'supervisor') {
          // Show issues that are:
          // 1. Assigned specifically to this user, OR
          // 2. Assigned to supervisor role (assignedRole = 'supervisor') and match user's department
          const baseCondition = {
            assignedRole: 'supervisor',
            $or: [
              { assignedTo: null },
              { assignedTo: { $exists: false } }
            ]
          };
          
          // SUPERVISORS: Only see issues from their own department
          if (userDepartments.length > 0) {
            baseCondition.category = { $in: userDepartments };
          }
          
          filter.$or = [
            { assignedTo: user._id }, // Specifically assigned to this user
            baseCondition
          ];
        }
        // Commissioner: See only issues assigned to commissioner level
        else if (user.role === 'commissioner') {
          // COMMISSIONERS: ONLY see issues that are assigned to commissioner level
          const baseCondition = {
            assignedRole: 'commissioner',
            $or: [
              { assignedTo: null },
              { assignedTo: { $exists: false } }
            ]
          };
          
          // Commissioners with 'All' departments see ALL commissioner-level issues
          // Commissioners with specific departments only see issues from their departments
          if (!hasAllDepartments && userDepartments.length > 0) {
            baseCondition.category = { $in: userDepartments };
          }
          
          filter.$or = [
            { assignedTo: user._id }, // Specifically assigned to this user
            baseCondition
          ];
        }
      } else {
        // Fallback for other roles
        filter.assignedTo = user._id;
      }

      // Status filtering: Show unresolved issues by default, but allow filtering by specific status
      // Unresolved statuses: 'reported', 'in-progress', 'escalated'
      // Note: When an issue is assigned, it gets status 'in-progress', which is included here
      const unresolvedStatuses = ['reported', 'in-progress', 'escalated'];
      
      if (status && status !== 'all') {
        // If specific status requested, use it
        if (status === 'resolved') {
          filter.status = 'resolved';
        } else {
          filter.status = status;
        }
      } else {
        // Default: show only unresolved issues (including newly assigned ones)
        if (filter.$or) {
          // For $or conditions, add unresolved status filter to each condition
          filter.$or = filter.$or.map(condition => ({
            ...condition,
            status: { $in: unresolvedStatuses }
          }));
        } else {
          filter.status = { $in: unresolvedStatuses };
        }
      }

      // Apply category filter if provided
      if (category && category !== 'all') {
        if (filter.$or) {
          // Add category to all $or conditions
          filter.$or = filter.$or.map(condition => {
            if (condition.category && Array.isArray(condition.category.$in)) {
              // If category already has $in, intersect with provided category
              return {
                ...condition,
                category: { $in: condition.category.$in.filter(c => c === category) }
              };
            }
            return {
              ...condition,
              category: category
            };
          });
        } else {
          if (filter.category && Array.isArray(filter.category.$in)) {
            // Intersect with existing category filter
            filter.category = { $in: filter.category.$in.filter(c => c === category) };
          } else {
            filter.category = category;
          }
        }
      }

      // Apply priority filter if provided
      if (priority && priority !== 'all') {
        filter.priority = priority;
      }

      const issues = await Issue.find(filter)
        .populate('reportedBy', 'name email profileImage')
        .populate('assignedTo', 'name email employeeId role')
        .populate('assignedBy', 'name email employeeId')
        .populate('acceptedBy', 'name email employeeId')
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Issue.countDocuments(filter);

      res.json({ 
        success: true, 
        data: { 
          issues,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        } 
      });
    } catch (error) {
      console.error('List assigned issues error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }

  // Accept issue (exclusive lock - only one employee can accept)
  async acceptIssue(req, res) {
    try {
      const { id } = req.params;
      const user = req.user;

      // Verify user is an employee
      const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
      if (!employeeRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only employees can accept issues'
        });
      }

      // Check if issue exists
      const issue = await Issue.findById(id);
      if (!issue) {
        return res.status(404).json({
          success: false,
          message: 'Issue not found'
        });
      }

      // If issue is assigned to a specific employee (not department), only that employee can accept
      if (issue.assignedTo && issue.assignedTo.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'This issue is assigned to another employee. Only the assigned employee can accept it.'
        });
      }

      // Atomic update: only accept if status is 'reported' or 'assigned' and not already accepted
      // Note: 'in-progress' status should not be accepted (only 'reported' and 'assigned' can be accepted)
      const result = await Issue.updateOne(
        {
          _id: id,
          status: { $in: ['reported', 'assigned'] },
          acceptedBy: null, // Ensure it's not already accepted
          $or: [
            { assignedTo: null }, // Department-assigned (assignedRole exists but assignedTo is null)
            { assignedTo: user._id } // Specifically assigned to this user
          ]
        },
        {
          $set: {
            status: 'in-progress', // After acceptance, status becomes 'in-progress'
            acceptedBy: user._id,
            acceptedAt: new Date(),
            // If not already assigned, assign to this employee
            assignedTo: user._id,
            assignedBy: issue.assignedBy || user._id,
            assignedAt: issue.assignedAt || new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        // Re-fetch to check current state
        const currentIssue = await Issue.findById(id);
        if (!currentIssue) {
          return res.status(404).json({
            success: false,
            message: 'Issue not found'
          });
        }

        // Check if already accepted
        if (currentIssue.acceptedBy) {
          return res.status(400).json({
            success: false,
            message: 'This issue has already been accepted by another employee.'
          });
        }

        // Check if status doesn't allow acceptance
        if (!['reported', 'assigned'].includes(currentIssue.status)) {
          return res.status(400).json({
            success: false,
            message: `This issue cannot be accepted. Current status: ${currentIssue.status}. Only 'reported' or 'assigned' issues can be accepted.`
          });
        }
        
        // Check if assigned to someone else
        if (currentIssue.assignedTo && currentIssue.assignedTo.toString() !== user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'This issue is assigned to another employee. Only the assigned employee can accept it.'
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Unable to accept issue. Please try again.'
        });
      }

      // Fetch the updated issue
      const updatedIssue = await Issue.findById(id)
        .populate('reportedBy', 'name email')
        .populate('acceptedBy', 'name email');

      return res.json({
        success: true,
        message: 'Issue accepted successfully',
        data: { issue: updatedIssue }
      });
    } catch (error) {
      console.error('Accept issue error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error accepting issue',
        error: error.message
      });
    }
  }

  async resolveIssue(req, res) {
    try {
      const { id } = req.params;
      const { latitude, longitude } = req.body;

      const issue = await Issue.findById(id).populate('reportedBy', '_id');
      if (!issue) {
        return res.status(404).json({ success: false, message: 'Issue not found' });
      }

      // STRICT AUTHORIZATION: ONLY the employee who accepted the issue can resolve it
      const user = req.user;
      const isAcceptedByUser = issue.acceptedBy?.toString() === user._id.toString();
      const isAdmin = user.role === 'admin';
      
      // If issue is accepted, ONLY the accepting employee can resolve it (or admin)
      if (issue.acceptedBy) {
        if (!isAdmin && !isAcceptedByUser) {
          return res.status(403).json({ 
            success: false, 
            message: 'Only the employee who accepted this issue can resolve it.' 
          });
        }
      } else {
        // If not accepted yet, issue must be accepted first
        return res.status(400).json({ 
          success: false, 
          message: 'Issue must be accepted before it can be resolved.' 
        });
      }


      // Attach resolved photo if provided via upload middleware
      if (req.file) {
        const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        const fileUrl = (process.env.CLOUDINARY_CLOUD_NAME)
          ? req.file.cloudinaryUrl // if upstream middleware sets
          : `${baseUrl}/uploads/${req.file.filename}`;

        issue.resolved = issue.resolved || {};
        issue.resolved.photo = {
          url: fileUrl,
          publicId: req.file.publicId || req.file.filename
        };
      }

      // Validate GPS coordinates are within a reasonable proximity of original issue location
      if (latitude && longitude) {
        const originalLat = issue.location?.coordinates?.latitude;
        const originalLng = issue.location?.coordinates?.longitude;
        
        if (originalLat && originalLng) {
          const allowedDistanceMeters = 100; // Looser threshold to account for mobile GPS jitter
          // Calculate distance using Haversine formula (approximate)
          const R = 6371000; // Earth's radius in meters
          const dLat = (parseFloat(latitude) - originalLat) * Math.PI / 180;
          const dLng = (parseFloat(longitude) - originalLng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(originalLat * Math.PI / 180) * Math.cos(parseFloat(latitude) * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c; // Distance in meters
          
          if (distance > allowedDistanceMeters) {
            return res.status(400).json({ 
              success: false, 
              message: `Resolved location must be within ${allowedDistanceMeters} meters of reported location. Current distance: ${Math.round(distance)}m` 
            });
          }
        }
        
        issue.resolved = issue.resolved || {};
        issue.resolved.location = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude)
        };
      }

      const oldStatus = issue.status;
      
      // If transitioning to resolved, award points and update status (keep issue visible)
      if (oldStatus !== 'resolved') {
        // Award points first
        if (issue.reportedBy && !issue.pointsAwarded) {
          try {
            const User = require('../models/User');
            const reporter = await User.findById(issue.reportedBy);
            if (reporter) {
              const currentPoints = reporter.points || 0;
              reporter.points = currentPoints + 10;
              await reporter.save();
              issue.pointsAwarded = true;
              console.log(`Awarded +10 points to user ${reporter._id} for resolved issue ${issue._id}. New total: ${reporter.points}`);
            }
          } catch (pointsError) {
            console.error('Error awarding points:', pointsError);
            return res.status(500).json({
              success: false,
              message: 'Failed to award points',
              error: pointsError.message
            });
          }
        }
      }
      
      // Only in-progress issues can be resolved (after employee accepts)
      if (issue.status !== 'in-progress') {
        return res.status(400).json({
          success: false,
          message: `Issue must be in-progress before resolution. Current status: ${issue.status}`
        });
      }

      // Update issue status to resolved and save (do NOT delete - keep visible for citizen)
      issue.resolvedAt = new Date();
      issue.status = 'resolved';
      issue.resolved = issue.resolved || {};
      issue.resolved.resolvedBy = req.user._id;
      if (issue.createdAt) {
        issue.actualResolutionTime = Math.floor((issue.resolvedAt - issue.createdAt) / (1000 * 60 * 60 * 24));
      }

      await issue.save();

      // Remove issue from ML dataset when resolved
      console.log(`[RESOLVE] Attempting to remove issue ${issue._id} from ML dataset. reportId: ${issue.reportId}, ML_API_URL: ${process.env.ML_API_URL ? 'configured' : 'not configured'}`);
      
      if (process.env.ML_API_URL) {
        try {
          // Construct remove URL - handle different ML_API_URL formats
          let baseUrl = process.env.ML_API_URL;
          // Remove /submit if present
          baseUrl = baseUrl.replace(/\/submit\/?$/, '');
          // Remove trailing slash
          baseUrl = baseUrl.replace(/\/$/, '');
          const removeUrl = `${baseUrl}/remove`;
          
          console.log(`[RESOLVE] Calling ML remove endpoint: ${removeUrl} with report_id: ${issue.reportId || 'NOT SET'}`);
          
          // If reportId is not set, try to find it by description and user_id
          let reportIdToRemove = issue.reportId;
          const params = new URLSearchParams();
          
          if (reportIdToRemove) {
            // Primary method: use reportId
            params.append('report_id', reportIdToRemove);
            console.log(`[RESOLVE] Using reportId to remove: ${reportIdToRemove}`);
          } else {
            // Fallback: use description and user_id
            console.log(`[RESOLVE] Issue ${issue._id} does not have reportId. Using fallback: description/user_id...`);
            if (issue.description && issue.reportedBy) {
              // Handle both populated object and ObjectId
              const userId = issue.reportedBy._id ? issue.reportedBy._id.toString() : issue.reportedBy.toString();
              params.append('description', issue.description);
              params.append('user_id', userId);
              console.log(`[RESOLVE] Fallback params: description="${issue.description.substring(0, 50)}...", user_id="${userId}"`);
            } else {
              console.warn(`[RESOLVE] Cannot remove issue ${issue._id} from ML dataset: missing reportId, description, or reportedBy`);
            }
          }
          
          if (params.toString()) {
            const removeResponse = await fetch(removeUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params
            });
            
            const responseText = await removeResponse.text();
            console.log(`[RESOLVE] ML remove response status: ${removeResponse.status}, body: ${responseText}`);
            
            if (removeResponse.ok) {
              try {
                const removeResult = JSON.parse(responseText);
                console.log(`[RESOLVE] ✅ Successfully removed issue ${issue._id} from ML dataset:`, removeResult);
              } catch (parseError) {
                console.log(`[RESOLVE] ✅ Removed issue ${issue._id} from ML dataset (non-JSON response): ${responseText}`);
              }
            } else {
              console.error(`[RESOLVE] ❌ Failed to remove issue from ML dataset. Status: ${removeResponse.status}, Response: ${responseText}`);
            }
          }
        } catch (removeError) {
          // Non-blocking: log error but don't fail resolution
          console.error(`[RESOLVE] ❌ Error removing issue from ML dataset (non-blocking):`, removeError);
          console.error(`[RESOLVE] Error details:`, removeError.message);
          console.error(`[RESOLVE] Stack trace:`, removeError.stack);
        }
      } else {
        console.warn(`[RESOLVE] ML_API_URL not configured. Cannot remove issue from ML dataset.`);
      }

      await notificationService.notifyIssueResolved(issue, req.user);

      return res.json({ success: true, message: 'Issue resolved', data: { issue } });
    } catch (error) {
      console.error('Resolve issue error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
}

module.exports = new EmployeeController();


