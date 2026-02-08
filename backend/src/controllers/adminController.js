const Issue = require('../models/Issue');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const notificationService = require('../services/notificationService');

class AdminController {
  // Get admin dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const [
        issueStats,
        userStats,
        recentIssues,
        categoryStats,
        priorityStats
      ] = await Promise.all([
        Issue.getStats(),
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
              verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
              adminUsers: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } }
            }
          }
        ]),
        Issue.find({ isPublic: true })
          .populate('reportedBy', 'name email')
          .populate('assignedTo', 'name email')
          .sort({ createdAt: -1 })
          .limit(10),
        Issue.aggregate([
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          }
        ]),
        Issue.aggregate([
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          }
        ])
      ]);

      // Calculate SLA breaches (issues older than 5 days and not resolved)
      const slaBreaches = await Issue.countDocuments({
        status: { $in: ['reported', 'in-progress'] },
        createdAt: { $lt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
      });

      // Calculate average resolution time
      const resolvedIssues = await Issue.find({
        status: 'resolved',
        resolvedAt: { $exists: true }
      });

      let avgResolutionTime = 0;
      if (resolvedIssues.length > 0) {
        const totalDays = resolvedIssues.reduce((sum, issue) => {
          const resolutionTime = (issue.resolvedAt - issue.createdAt) / (1000 * 60 * 60 * 24);
          return sum + resolutionTime;
        }, 0);
        avgResolutionTime = Math.round(totalDays / resolvedIssues.length * 10) / 10;
      }

      res.json({
        success: true,
        data: {
          issues: issueStats[0] || {
            total: 0,
            reported: 0,
            inProgress: 0,
            resolved: 0,
            closed: 0
          },
          users: userStats[0] || {
            totalUsers: 0,
            activeUsers: 0,
            verifiedUsers: 0,
            adminUsers: 0
          },
          slaBreaches,
          avgResolutionTime: `${avgResolutionTime} days`,
          recentIssues,
          categoryStats,
          priorityStats
        }
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting dashboard statistics',
        error: error.message
      });
    }
  }

  // Get analytics data
  async getAnalytics(req, res) {
    try {
      const { period = '30d' } = req.query;
      
      let startDate;
      switch (period) {
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const [
        issueTrends,
        resolutionTrends,
        categoryDistribution,
        userActivity,
        topReporters
      ] = await Promise.all([
        // Issue creation trends
        Issue.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
          }
        ]),
        // Resolution trends
        Issue.aggregate([
          {
            $match: {
              status: 'resolved',
              resolvedAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$resolvedAt' },
                month: { $month: '$resolvedAt' },
                day: { $dayOfMonth: '$resolvedAt' }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
          }
        ]),
        // Category distribution
        Issue.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          }
        ]),
        // User activity
        User.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
          }
        ]),
        // Top reporters
        Issue.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: '$reportedBy',
              count: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user'
            }
          },
          {
            $unwind: '$user'
          },
          {
            $project: {
              name: '$user.name',
              email: '$user.email',
              count: 1
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 10
          }
        ])
      ]);

      res.json({
        success: true,
        data: {
          period,
          issueTrends,
          resolutionTrends,
          categoryDistribution,
          userActivity,
          topReporters
        }
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting analytics',
        error: error.message
      });
    }
  }

  // Helper function to calculate distance between two coordinates (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  // Assign issue to user
  async assignIssue(req, res) {
    try {
      const { id } = req.params;
      const { assignedTo, reason } = req.body;

      const issue = await Issue.findById(id);
      if (!issue) {
        return res.status(404).json({
          success: false,
          message: 'Issue not found'
        });
      }

      let assignedUser = null;
      // Check if assignedTo is provided and not empty/null
      // Handle both string and non-string values
      const assignedToValue = assignedTo && typeof assignedTo === 'string' ? assignedTo.trim() : assignedTo;
      if (assignedToValue && assignedToValue !== '' && assignedToValue !== 'null' && assignedToValue !== null) {
        // Manual assignment - look up by Employee ID field first
        // Only try _id lookup if the value looks like a MongoDB ObjectId
        const isMongoId = /^[0-9a-fA-F]{24}$/.test(assignedToValue);
        
        let query;
        if (isMongoId) {
          // If it looks like a MongoDB ID, search by both employeeId and _id
          query = {
            $or: [
              { employeeId: assignedToValue },
              { _id: assignedToValue }
            ],
            role: { $in: ['field-staff', 'supervisor', 'commissioner', 'employee'] },
            isActive: true
          };
        } else {
          // Otherwise, only search by employeeId
          query = {
            employeeId: assignedToValue,
            role: { $in: ['field-staff', 'supervisor', 'commissioner', 'employee'] },
            isActive: true
          };
        }
        
        assignedUser = await User.findOne(query);
        
        if (!assignedUser) {
          return res.status(404).json({ success: false, message: `Employee with ID "${assignedToValue}" not found` });
        }
        // Verify the user is an active employee
        const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
        if (!employeeRoles.includes(assignedUser.role) || !assignedUser.isActive) {
          return res.status(400).json({ 
            success: false, 
            message: 'Selected user is not an active employee' 
          });
        }
      } else {
        // Auto-assign: Assign to ALL employees in the department (not a specific employee)
        // This allows all employees in that department to see and resolve the issue
        const issueCategory = issue.category;

        // Find all active employees with matching department
        const employeeRoles = ['field-staff', 'supervisor', 'commissioner', 'employee'];
        const departmentEmployees = await User.find({
          role: { $in: employeeRoles },
          isActive: true,
          $or: [
            { departments: { $in: [issueCategory, 'All'] } },
            { department: { $in: [issueCategory, 'All'] } }
          ]
        });

        if (departmentEmployees.length === 0) {
          return res.status(400).json({ 
            success: false, 
            message: 'No active employees found for this department. Please assign manually.' 
          });
        }

        // Don't assign to a specific user - assign to the department
        // Set assignedRole to 'field-staff' to indicate it's assigned to field staff level
        const assignedRole = 'field-staff';
        
        // Update issue: set assignedRole, but keep status as 'reported'
        // Status must remain 'reported' until employee accepts it
        // This way all employees in the department can see it
        issue.assignedRole = assignedRole;
        issue.assignedBy = req.user._id;
        issue.assignedAt = new Date();
        // Status stays 'reported' - only employee acceptance can change it to 'in-progress'
        if (issue.status === 'reported' || !issue.status) {
          issue.status = 'reported';
        }
        
        // Calculate escalation deadline based on priority and role
        if (issue.priority) {
          const deadline = issue.calculateEscalationDeadline(issue.priority, assignedRole);
          issue.escalationDeadline = deadline;
        }
        
        await issue.save();

        // Notify all employees in the department
        const notificationPromises = departmentEmployees.map(emp => 
          notificationService.notifyIssueAssignment(issue, emp, req.user)
        );
        await Promise.all(notificationPromises);

        res.json({
          success: true,
          message: `Issue assigned to department. ${departmentEmployees.length} employees notified.`,
          data: { 
            issue,
            assignedToDepartment: issueCategory,
            employeesNotified: departmentEmployees.length
          }
        });
        
        return; // Exit early since we've handled the assignment
      }

      // Manual assignment: assign to specific user
      // Determine assigned role based on user's role
      let assignedRole = null;
      if (assignedUser.role === 'field-staff' || assignedUser.role === 'employee') {
        assignedRole = 'field-staff';
      } else if (assignedUser.role === 'supervisor') {
        assignedRole = 'supervisor';
      } else if (assignedUser.role === 'commissioner') {
        assignedRole = 'commissioner';
      }

      // Assign the issue
      await issue.assign(assignedUser._id, req.user._id, assignedRole);

      // Notify the assigned user
      await notificationService.notifyIssueAssignment(issue, assignedUser, req.user);

      res.json({
        success: true,
        message: 'Issue assigned successfully',
        data: { 
          issue,
          assignedTo: {
            name: assignedUser.name,
            employeeId: assignedUser.employeeId,
            role: assignedUser.role
          }
        }
      });
    } catch (error) {
      console.error('Assign issue error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error assigning issue',
        error: error.message
      });
    }
  }

  // Update issue status
  async updateIssueStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      // Admin CANNOT resolve issues - only employees can resolve
      if (status === 'resolved') {
        return res.status(403).json({
          success: false,
          message: 'Admin cannot resolve issues. Only assigned employees can resolve issues.'
        });
      }

      // STRICT RULE: Admin CANNOT set status to 'in-progress'
      // Only employee acceptance can change status from 'reported' to 'in-progress'
      if (status === 'in-progress') {
        return res.status(403).json({
          success: false,
          message: 'Admin cannot set issue status to in-progress. Only employees can accept issues to change status to in-progress.'
        });
      }

      const issue = await Issue.findById(id);
      if (!issue) {
        return res.status(404).json({
          success: false,
          message: 'Issue not found'
        });
      }

      const oldStatus = issue.status;
      
      // For non-resolved and non-in-progress status updates, proceed normally
      issue.status = status;

      await issue.save();

      // Notify about status change
      await notificationService.notifyIssueStatusChange(issue, oldStatus, status, req.user);

      res.json({
        success: true,
        message: 'Issue status updated successfully',
        data: { issue }
      });
    } catch (error) {
      console.error('Update issue status error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating issue status',
        error: error.message
      });
    }
  }

  // Get all users
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 20, role, search } = req.query;

      const filter = {};
      if (role) filter.role = role;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const users = await User.find(filter)
        .select('-password -otp')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(filter);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting users',
        error: error.message
      });
    }
  }

  // Update user status
  async updateUserStatus(req, res) {
    try {
      const { userId } = req.params;
      const { isActive, role } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (isActive !== undefined) user.isActive = isActive;
      if (role) user.role = role;

      await user.save();

      res.json({
        success: true,
        message: 'User status updated successfully',
        data: { user: user.getProfile() }
      });
    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating user status',
        error: error.message
      });
    }
  }

  // Get system notifications
  async getSystemNotifications(req, res) {
    try {
      const { page = 1, limit = 20, type } = req.query;

      const filter = {};
      if (type) filter.type = type;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const notifications = await Notification.find(filter)
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Notification.countDocuments(filter);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get system notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting system notifications',
        error: error.message
      });
    }
  }

  // Send system announcement
  async sendAnnouncement(req, res) {
    try {
      const { title, message, targetUsers = 'all', priority = 'medium' } = req.body;

      let users;
      if (targetUsers === 'all') {
        users = await User.find({ isActive: true });
      } else if (targetUsers === 'citizens') {
        users = await User.find({ role: 'citizen', isActive: true });
      } else if (targetUsers === 'admins') {
        users = await User.find({ role: 'admin', isActive: true });
      }

      // Create notifications for all target users
      const notifications = users.map(user => ({
        user: user._id,
        type: 'system_announcement',
        title,
        message,
        priority,
        data: {
          metadata: {
            announcement: true
          }
        }
      }));

      await Notification.insertMany(notifications);

      res.json({
        success: true,
        message: 'Announcement sent successfully',
        data: {
          recipients: users.length
        }
      });
    } catch (error) {
      console.error('Send announcement error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error sending announcement',
        error: error.message
      });
    }
  }

  // Create employee (Field Staff, Supervisor, or Commissioner)
  async createEmployee(req, res) {
    try {
      const { name, employeeId, password, role, departments, email, mobile } = req.body;

      // Validate required fields
      if (!name || !employeeId || !password || !role) {
        return res.status(400).json({
          success: false,
          message: 'Name, Employee ID, Password, and Role are required'
        });
      }

      // Validate role
      const validRoles = ['field-staff', 'supervisor', 'commissioner'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Role must be one of: ${validRoles.join(', ')}`
        });
      }

      // Validate departments
      const validDepartments = [
        'Road & Traffic',
        'Water & Drainage',
        'Electricity',
        'Garbage & Sanitation',
        'Street Lighting',
        'Public Safety',
        'Parks & Recreation',
        'All',
        'Other'
      ];

      let departmentArray = [];
      if (departments) {
        if (Array.isArray(departments)) {
          departmentArray = departments.filter(d => validDepartments.includes(d));
        } else if (typeof departments === 'string') {
          departmentArray = [departments].filter(d => validDepartments.includes(d));
        }
      }

      if (departmentArray.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one valid department must be selected'
        });
      }

      // Check if employee ID already exists
      const existingUser = await User.findOne({ employeeId });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID already exists'
        });
      }

      // Determine single department value for compatibility
      let singleDepartment = null;
      if (departmentArray.length === 1) {
        singleDepartment = departmentArray[0];
      } else if (departmentArray.includes('All')) {
        singleDepartment = 'All';
      } else if (departmentArray.length > 0) {
        singleDepartment = departmentArray[0];
      }

      // Create new employee
      const employeeData = {
        name: name.trim(),
        employeeId: employeeId.trim(),
        password: password,
        role: role,
        departments: departmentArray,
        isVerified: true,
        isActive: true
      };

      // Set department field (single value for compatibility) - only if we have a valid value
      if (singleDepartment && validDepartments.includes(singleDepartment)) {
        employeeData.department = singleDepartment;
      }

      // Add optional fields only if provided and valid
      if (email && email.trim()) {
        employeeData.email = email.trim().toLowerCase();
      }
      if (mobile && mobile.trim()) {
        employeeData.mobile = mobile.trim();
      }

      const employee = new User(employeeData);
      await employee.save();

      res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: {
          employee: employee.getProfile()
        }
      });
    } catch (error) {
      console.error('Create employee error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
        errors: error.errors
      });
      
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
        return res.status(400).json({
          success: false,
          message: `${duplicateField === 'employeeId' ? 'Employee ID' : duplicateField} already exists`
        });
      }
      
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors || {}).map(err => err.message).join(', ');
        return res.status(400).json({
          success: false,
          message: `Validation error: ${validationErrors}`,
          error: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Server error creating employee',
        error: error.message
      });
    }
  }

  // Get all employees
  async getEmployees(req, res) {
    try {
      const { page = 1, limit = 20, role, department, search } = req.query;

      const filter = {
        role: { $in: ['field-staff', 'supervisor', 'commissioner', 'employee'] },
        isActive: true
      };

      if (role) filter.role = role;
      if (department) {
        filter.$or = [
          { departments: { $in: [department, 'All'] } },
          { department: { $in: [department, 'All'] } }
        ];
      }
      if (search) {
        filter.$or = [
          ...(filter.$or || []),
          { name: { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const employees = await User.find(filter)
        .select('-password -otp')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(filter);

      res.json({
        success: true,
        data: {
          employees,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get employees error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting employees',
        error: error.message
      });
    }
  }

  // Update employee
  async updateEmployee(req, res) {
    try {
      const { employeeId } = req.params;
      const { name, role, departments, isActive, email, mobile } = req.body;

      const employee = await User.findOne({ employeeId });
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }

      if (name) employee.name = name;
      if (role) {
        const validRoles = ['field-staff', 'supervisor', 'commissioner'];
        if (validRoles.includes(role)) {
          employee.role = role;
        }
      }
      if (departments) {
        const validDepartments = [
          'Road & Traffic',
          'Water & Drainage',
          'Electricity',
          'Garbage & Sanitation',
          'Street Lighting',
          'Public Safety',
          'Parks & Recreation',
          'All',
          'Other'
        ];
        const departmentArray = Array.isArray(departments) 
          ? departments.filter(d => validDepartments.includes(d))
          : [departments].filter(d => validDepartments.includes(d));
        if (departmentArray.length > 0) {
          employee.departments = departmentArray;
          employee.department = departmentArray.length === 1 ? departmentArray[0] : (departmentArray.includes('All') ? 'All' : departmentArray[0]);
        }
      }
      if (isActive !== undefined) employee.isActive = isActive;
      if (email) employee.email = email;
      if (mobile) employee.mobile = mobile;

      await employee.save();

      res.json({
        success: true,
        message: 'Employee updated successfully',
        data: {
          employee: employee.getProfile()
        }
      });
    } catch (error) {
      console.error('Update employee error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating employee',
        error: error.message
      });
    }
  }

  // Delete employee (soft delete - set isActive to false)
  async deleteEmployee(req, res) {
    try {
      const { employeeId } = req.params;

      const employee = await User.findOne({ employeeId });
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }

      employee.isActive = false;
      await employee.save();

      res.json({
        success: true,
        message: 'Employee deactivated successfully'
      });
    } catch (error) {
      console.error('Delete employee error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting employee',
        error: error.message
      });
    }
  }

  // Get issue reports
  async getIssueReports(req, res) {
    try {
      const { startDate, endDate, format = 'json' } = req.query;

      const filter = {};
      if (startDate && endDate) {
        filter.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const issues = await Issue.find(filter)
        .populate('reportedBy', 'name email mobile')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 });

      if (format === 'csv') {
        // Generate CSV format
        const csvData = issues.map(issue => ({
          'Issue ID': issue._id,
          'Title': issue.title,
          'Category': issue.category,
          'Status': issue.status,
          'Priority': issue.priority,
          'Reporter': issue.reportedBy?.name || 'Anonymous',
          'Reporter Email': issue.reportedBy?.email || '',
          'Reporter Mobile': issue.reportedBy?.mobile || '',
          'Assigned To': issue.assignedTo?.name || 'Unassigned',
          'Location': issue.location.name,
          'Created At': issue.createdAt,
          'Resolved At': issue.resolvedAt || '',
          'Resolution Time (Days)': issue.actualResolutionTime || ''
        }));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=issues-report.csv');
        
        // Simple CSV generation
        const headers = Object.keys(csvData[0] || {});
        const csvContent = [
          headers.join(','),
          ...csvData.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');

        return res.send(csvContent);
      }

      res.json({
        success: true,
        data: { issues }
      });
    } catch (error) {
      console.error('Get issue reports error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error getting issue reports',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();
