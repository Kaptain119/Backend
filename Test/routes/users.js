const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ success: false, message: 'Invalid token' });
    }
};

// Generate JWT Token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, email: user.email, isPremium: user.isPremium },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
};

// Register User
router.post('/register', [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('referralCode').trim().notEmpty().withMessage('Referral code is required')
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { name, email, phone, password, referralCode } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered. Please login instead.' 
            });
        }
        
        // Validate referral code
        const validCodes = ['PRIME2023', 'EARN800', 'NIGERIA1', 'REF888', 'BONUS777', 'WELCOME100', 'EARNMORE', 'GETPAID'];
        if (!validCodes.includes(referralCode.toUpperCase())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid referral code. Please enter a valid code.' 
            });
        }
        
        // Create new user
        const user = new User({
            name,
            email,
            phone,
            password,
            referralCode: referralCode.toUpperCase()
        });
        
        await user.save();
        
        // Generate token
        const token = generateToken(user);
        
        // Send response
        res.status(201).json({
            success: true,
            message: 'Registration successful! Welcome bonus ₦800 added.',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                isPremium: user.isPremium,
                level: user.level,
                streak: user.streak
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during registration' 
        });
    }
});

// Login User
router.post('/login', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is deactivated. Contact support.' 
            });
        }
        
        // Update last login
        await user.updateLastLogin();
        
        // Generate token
        const token = generateToken(user);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                isPremium: user.isPremium,
                level: user.level,
                streak: user.streak,
                tasksCompleted: user.tasksCompleted,
                totalEarned: user.totalEarned
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

// Get User Profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -transactions -completedTasks');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching profile' 
        });
    }
});

// Complete Task
router.post('/complete-task', verifyToken, async (req, res) => {
    try {
        const { taskId, taskTitle, reward } = req.body;
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Check if task already completed
        const alreadyCompleted = user.completedTasks.some(task => 
            task.taskId === taskId
        );
        
        if (alreadyCompleted) {
            return res.status(400).json({ 
                success: false, 
                message: 'Task already completed' 
            });
        }
        
        // Calculate actual reward (premium bonus)
        let actualReward = reward;
        if (user.isPremium) {
            actualReward = Math.floor(reward * 1.5); // 50% bonus for premium
        }
        
        // Update user data
        user.balance += actualReward;
        user.totalEarned += actualReward;
        user.tasksCompleted += 1;
        
        // Add XP
        user.xp += Math.floor(actualReward / 10);
        
        // Check level up
        const xpNeeded = user.level * 100;
        if (user.xp >= xpNeeded) {
            user.level += 1;
            user.xp = 0;
        }
        
        // Add to completed tasks
        user.completedTasks.push({
            taskId,
            title: taskTitle,
            reward: actualReward,
            completedAt: new Date()
        });
        
        // Add transaction
        user.transactions.push({
            type: 'task',
            amount: actualReward,
            description: `Completed task: ${taskTitle}`,
            status: 'completed',
            reference: `TASK_${Date.now()}`
        });
        
        await user.save();
        
        res.json({
            success: true,
            message: `Task completed! ₦${actualReward} added to your balance.`,
            reward: actualReward,
            balance: user.balance,
            level: user.level,
            xp: user.xp
        });
        
    } catch (error) {
        console.error('Complete task error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error completing task' 
        });
    }
});

// Upgrade to Premium
router.post('/upgrade', verifyToken, async (req, res) => {
    try {
        const { transactionProof } = req.body;
        const userId = req.user.id;
        
        if (!transactionProof) {
            return res.status(400).json({ 
                success: false, 
                message: 'Transaction proof is required' 
            });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        if (user.isPremium) {
            return res.status(400).json({ 
                success: false, 
                message: 'User is already premium' 
            });
        }
        
        // Update premium status
        user.isPremium = true;
        user.premiumSince = new Date();
        user.premiumPaymentProof = transactionProof;
        
        // Set premium expiry (30 days from now)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        user.premiumExpires = expiryDate;
        
        // Add premium bonus
        user.balance += 1000; // Premium welcome bonus
        user.totalEarned += 1000;
        
        // Add transaction
        user.transactions.push({
            type: 'premium_payment',
            amount: 5000,
            description: 'Premium membership upgrade',
            status: 'completed',
            reference: `PREMIUM_${Date.now()}`
        });
        
        await user.save();
        
        res.json({
            success: true,
            message: '🎉 Upgrade successful! You are now a Premium member.',
            premiumExpires: expiryDate,
            bonus: 1000,
            balance: user.balance
        });
        
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error processing upgrade' 
        });
    }
});

// Request Withdrawal
router.post('/withdraw', verifyToken, async (req, res) => {
    try {
        const { bankName, accountNumber, amount } = req.body;
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Check if user is premium
        if (!user.isPremium) {
            return res.status(403).json({ 
                success: false, 
                message: 'Upgrade to premium to unlock withdrawals' 
            });
        }
        
        // Check minimum withdrawal
        if (amount < 10000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum withdrawal amount is ₦10,000' 
            });
        }
        
        // Check balance
        if (user.balance < amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient balance' 
            });
        }
        
        // Deduct balance
        user.balance -= amount;
        user.totalWithdrawn += amount;
        
        // Add withdrawal transaction
        user.transactions.push({
            type: 'withdrawal',
            amount: -amount,
            description: `Withdrawal to ${bankName} (${accountNumber})`,
            status: 'pending',
            reference: `WITHDRAW_${Date.now()}`
        });
        
        await user.save();
        
        res.json({
            success: true,
            message: '✅ Withdrawal request submitted! Funds will be processed within 24 hours.',
            balance: user.balance,
            reference: `WITHDRAW_${Date.now()}`
        });
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error processing withdrawal' 
        });
    }
});

// Update Profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { name, phone, settings } = req.body;
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Update fields
        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (settings) user.settings = { ...user.settings, ...settings };
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                name: user.name,
                phone: user.phone,
                settings: user.settings
            }
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating profile' 
        });
    }
});

// Change Password
router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Current password is incorrect' 
            });
        }
        
        // Update password
        user.password = newPassword;
        user.lastPasswordChange = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error changing password' 
        });
    }
});

// Track WhatsApp Group Join
router.post('/track-whatsapp-join', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Update WhatsApp join stats
        user.whatsappGroupJoined = true;
        user.groupJoins += 1;
        user.lastGroupJoin = new Date();
        
        await user.save();
        
        res.json({
            success: true,
            message: 'WhatsApp join tracked successfully'
        });
        
    } catch (error) {
        console.error('WhatsApp tracking error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error tracking WhatsApp join' 
        });
    }
});

// Get User Dashboard Data
router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('name email balance totalEarned tasksCompleted level streak xp isPremium referrals transactions');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Calculate success rate
        const successRate = user.tasksCompleted > 0 ? 
            Math.min(95, Math.floor((user.tasksCompleted / (user.tasksCompleted + 5)) * 100)) : 0;
        
        // Calculate XP needed for next level
        const xpNeeded = user.level * 100;
        const progressPercent = Math.min(100, Math.floor((user.xp / xpNeeded) * 100));
        
        // Get recent transactions
        const recentTransactions = user.transactions
            .sort((a, b) => b.date - a.date)
            .slice(0, 10);
        
        res.json({
            success: true,
            dashboard: {
                user: {
                    name: user.name,
                    email: user.email,
                    balance: user.balance,
                    totalEarned: user.totalEarned,
                    isPremium: user.isPremium,
                    level: user.level,
                    streak: user.streak,
                    tasksCompleted: user.tasksCompleted,
                    referralCount: user.referrals.length
                },
                stats: {
                    successRate,
                    xp: user.xp,
                    xpNeeded,
                    progressPercent
                },
                recentTransactions
            }
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching dashboard' 
        });
    }
});

module.exports = router;
