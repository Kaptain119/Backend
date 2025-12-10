const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    
    // Referral System
    referralCode: {
        type: String,
        required: true
    },
    referredBy: {
        type: String,
        default: null
    },
    referrals: [{
        userId: mongoose.Schema.Types.ObjectId,
        name: String,
        email: String,
        date: Date
    }],
    referralCount: {
        type: Number,
        default: 0
    },
    
    // Account Details
    balance: {
        type: Number,
        default: 800 // Welcome bonus
    },
    totalEarned: {
        type: Number,
        default: 800
    },
    totalWithdrawn: {
        type: Number,
        default: 0
    },
    
    // Premium Features
    isPremium: {
        type: Boolean,
        default: false
    },
    premiumSince: {
        type: Date,
        default: null
    },
    premiumExpires: {
        type: Date,
        default: null
    },
    premiumPaymentProof: {
        type: String,
        default: null
    },
    
    // Progress Tracking
    level: {
        type: Number,
        default: 1
    },
    xp: {
        type: Number,
        default: 0
    },
    streak: {
        type: Number,
        default: 1
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    tasksCompleted: {
        type: Number,
        default: 0
    },
    
    // Security
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    lastPasswordChange: {
        type: Date,
        default: Date.now
    },
    
    // Transactions
    transactions: [{
        type: {
            type: String,
            enum: ['task', 'bonus', 'withdrawal', 'premium_payment', 'referral']
        },
        amount: Number,
        description: String,
        date: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'completed'
        },
        reference: String
    }],
    
    // Tasks
    completedTasks: [{
        taskId: String,
        title: String,
        reward: Number,
        completedAt: Date
    }],
    
    // Settings
    settings: {
        notifications: {
            type: Boolean,
            default: true
        },
        autoStartTasks: {
            type: Boolean,
            default: false
        },
        twoFactorAuth: {
            type: Boolean,
            default: false
        }
    },
    
    // WhatsApp Integration
    whatsappGroupJoined: {
        type: Boolean,
        default: false
    },
    lastGroupJoin: {
        type: Date,
        default: null
    },
    groupJoins: {
        type: Number,
        default: 0
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate referral code method
userSchema.statics.generateReferralCode = function() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

// Update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;