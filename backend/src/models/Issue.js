const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Issue title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Issue description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Road & Traffic',
      'Water & Drainage', 
      'Electricity',
      'Garbage & Sanitation',
      'Street Lighting',
      'Public Safety',
      'Parks & Recreation',
      'Other'
    ]
  },
  location: {
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true
    },
    coordinates: {
      latitude: {
        type: Number,
        required: [true, 'Latitude is required'],
        min: [-90, 'Invalid latitude'],
        max: [90, 'Invalid latitude']
      },
      longitude: {
        type: Number,
        required: [true, 'Longitude is required'],
        min: [-180, 'Invalid longitude'],
        max: [180, 'Invalid longitude']
      }
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String
    }
  },
  status: {
    type: String,
    enum: ['reported', 'assigned', 'accepted', 'in-progress', 'resolved', 'closed', 'escalated'],
    default: 'reported'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reporter is required']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  assignedRole: {
    type: String,
    enum: ['field-staff', 'supervisor', 'commissioner', null],
    default: null
  },
  escalationHistory: [{
    fromRole: {
      type: String,
      enum: ['field-staff', 'supervisor', 'commissioner']
    },
    toRole: {
      type: String,
      enum: ['field-staff', 'supervisor', 'commissioner']
    },
    escalatedAt: {
      type: Date,
      default: Date.now
    },
    escalatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      default: 'Time limit exceeded'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    }
  }],
  escalationDeadline: {
    type: Date,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  upvotes: {
    type: Number,
    default: 0
  },
  upvotedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  images: [{
    url: {
      type: String,
      required: true
    },
    publicId: String,
    caption: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  resolved: {
    photo: {
      url: String,
      publicId: String
    },
    location: {
      latitude: Number,
      longitude: Number
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  documents: [{
    url: {
      type: String,
      required: true
    },
    publicId: String,
    name: String,
    type: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  estimatedResolutionTime: {
    type: Number, // in days
    default: null
  },
  actualResolutionTime: {
    type: Number, // in days
    default: null
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    comment: {
      type: String,
      maxlength: [500, 'Feedback comment cannot exceed 500 characters']
    },
    submittedAt: {
      type: Date,
      default: null
    }
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['reported', 'assigned', 'accepted', 'in-progress', 'resolved', 'closed', 'escalated']
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: String,
    comment: String
  }],
  pointsAwarded: {
    type: Boolean,
    default: false
  },
  reportId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
issueSchema.index({ status: 1 });
issueSchema.index({ category: 1 });
issueSchema.index({ priority: 1 });
issueSchema.index({ reportedBy: 1 });
issueSchema.index({ assignedTo: 1 });
issueSchema.index({ 'location.coordinates.latitude': 1, 'location.coordinates.longitude': 1 });
issueSchema.index({ createdAt: -1 });
issueSchema.index({ upvotes: -1 });

// Geospatial index for location-based queries
issueSchema.index({ 'location.coordinates': '2dsphere' });

// Virtual for issue age in days
issueSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for resolution time
issueSchema.virtual('resolutionTime').get(function() {
  if (this.resolvedAt && this.createdAt) {
    return Math.floor((this.resolvedAt - this.createdAt) / (1000 * 60 * 60 * 24));
  }
  return null;
});

// Pre-save middleware to update status history
issueSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedBy: this.assignedBy || this.reportedBy,
      changedAt: new Date(),
      reason: 'Status updated'
    });
  }
  next();
});

// Method to upvote an issue
issueSchema.methods.upvote = function(userId) {
  if (!this.upvotedBy.includes(userId)) {
    this.upvotedBy.push(userId);
    this.upvotes += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove upvote
issueSchema.methods.removeUpvote = function(userId) {
  const index = this.upvotedBy.indexOf(userId);
  if (index > -1) {
    this.upvotedBy.splice(index, 1);
    this.upvotes = Math.max(0, this.upvotes - 1);
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to assign issue
issueSchema.methods.assign = function(assignedTo, assignedBy, assignedRole = null) {
  this.assignedTo = assignedTo;
  this.assignedBy = assignedBy;
  this.assignedAt = new Date();
  this.assignedRole = assignedRole;
  // Status must remain 'reported' - only employee acceptance can change it to 'in-progress'
  // Keep current status if it exists, otherwise set to 'reported'
  if (!this.status || this.status === 'reported') {
    this.status = 'reported';
  }
  
  // Calculate escalation deadline based on priority and role
  if (assignedRole && this.priority) {
    const deadline = this.calculateEscalationDeadline(this.priority, assignedRole);
    this.escalationDeadline = deadline;
  }
  
  return this.save();
};

// Method to calculate escalation deadline
issueSchema.methods.calculateEscalationDeadline = function(priority, role) {
  const now = new Date();
  let hours = 0;
  
  // HIGH/URGENT PRIORITY
  if (priority === 'high' || priority === 'urgent') {
    if (role === 'field-staff') {
      hours = 2; // Escalate to supervisor within 2 hours
    } else if (role === 'supervisor') {
      hours = 2; // Escalate to commissioner within 2 hours
    }
  }
  // MEDIUM PRIORITY
  else if (priority === 'medium') {
    if (role === 'field-staff') {
      hours = 12; // Escalate to supervisor within 12 hours
    } else if (role === 'supervisor') {
      hours = 12; // Escalate to commissioner within 12 hours
    }
  }
  // LOW PRIORITY
  else if (priority === 'low') {
    if (role === 'field-staff') {
      hours = 24; // Escalate to supervisor within 24 hours
    } else if (role === 'supervisor') {
      hours = 24; // Escalate to commissioner within 24 hours
    }
  }
  
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
};

// Method to escalate issue
issueSchema.methods.escalate = function(toRole, escalatedBy, reason = 'Time limit exceeded') {
  const fromRole = this.assignedRole;
  
  this.escalationHistory.push({
    fromRole,
    toRole,
    escalatedAt: new Date(),
    escalatedBy,
    reason,
    
    priority: this.priority
  });
  
  this.assignedRole = toRole;
  this.assignedAt = new Date();
  this.status = 'escalated';
  
  // Recalculate deadline for new role
  if (toRole && this.priority) {
    const deadline = this.calculateEscalationDeadline(this.priority, toRole);
    this.escalationDeadline = deadline;
  }
  
  return this.save();
};

// Method to resolve issue
issueSchema.methods.resolve = function(resolvedBy) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  if (this.createdAt) {
    this.actualResolutionTime = Math.floor((this.resolvedAt - this.createdAt) / (1000 * 60 * 60 * 24));
  }
  return this.save();
};

// Static method to find nearby issues
issueSchema.statics.findNearby = function(latitude, longitude, maxDistance = 5000) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    isPublic: true
  });
};

// Static method to get issue statistics
issueSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        reported: { $sum: { $cond: [{ $eq: ['$status', 'reported'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
        avgResolutionTime: { $avg: '$actualResolutionTime' }
      }
    }
  ]);
};

module.exports = mongoose.model('Issue', issueSchema);
