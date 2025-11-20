import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users, subscriptionPlans } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { generateToken, authenticateToken, AuthRequest } from '../auth/jwt';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration schema
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
});

// Login schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Register endpoint
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName } = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with free plan
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      firstName,
      lastName,
      plan: 'free',
      planStatus: 'active',
      usageMessages: 0,
      usageStorageMb: 0,
      usageWhatsappGroups: 0,
    }).returning({
      id: users.id,
      email: users.email,
      plan: users.plan,
      isAdmin: users.isAdmin,
      firstName: users.firstName,
      lastName: users.lastName,
    });

    // Generate JWT token
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      plan: newUser.plan,
      isAdmin: newUser.isAdmin,
    });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: newUser,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user by email
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
    });

    // Update last login timestamp
    await db.update(users)
      .set({ updatedAt: new Date() })
      .where(eq(users.id, user.id));

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        planStatus: user.planStatus,
        isAdmin: user.isAdmin,
        firstName: user.firstName,
        lastName: user.lastName,
        usageMessages: user.usageMessages,
        usageStorageMb: user.usageStorageMb,
        usageWhatsappGroups: user.usageWhatsappGroups,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      planStatus: users.planStatus,
      isAdmin: users.isAdmin,
      firstName: users.firstName,
      lastName: users.lastName,
      usageMessages: users.usageMessages,
      usageStorageMb: users.usageStorageMb,
      usageWhatsappGroups: users.usageWhatsappGroups,
      usagePeriodStart: users.usagePeriodStart,
      usagePeriodEnd: users.usagePeriodEnd,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.user!.userId))
    .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Get subscription plans (coming soon for now)
router.get('/plans', async (req, res) => {
  try {
    // For now, return static plans until Stripe is set up
    const plans = [
      {
        id: 'free',
        name: 'free',
        maxMessages: 500,
        maxStorageMb: 100,
        maxWhatsappGroups: 3,
        maxPidAlerts: 10,
        features: ['basic_parsing', 'email_alerts'],
        price: '$0/month',
        status: 'active'
      },
      {
        id: 'pro',
        name: 'pro', 
        maxMessages: 10000,
        maxStorageMb: 5000,
        maxWhatsappGroups: 20,
        maxPidAlerts: 100,
        features: ['basic_parsing', 'email_alerts', 'whatsapp_alerts', 'excel_export'],
        price: 'Coming Soon',
        status: 'coming_soon'
      },
      {
        id: 'business',
        name: 'business',
        maxMessages: 100000,
        maxStorageMb: 50000,
        maxWhatsappGroups: 100,
        maxPidAlerts: 500,
        features: ['basic_parsing', 'email_alerts', 'whatsapp_alerts', 'excel_export', 'api_access', 'custom_parsing'],
        price: 'Coming Soon', 
        status: 'coming_soon'
      }
    ];

    res.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const updateSchema = z.object({
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().optional(),
    });

    const { firstName, lastName } = updateSchema.parse(req.body);

    const [updatedUser] = await db.update(users)
      .set({
        firstName,
        lastName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user!.userId))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password endpoint
router.post('/change-password', authLimiter, authenticateToken, async (req: AuthRequest, res) => {
  try {
    const changePasswordSchema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    });

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    // Get current user
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user || !user.passwordHash) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user!.userId));

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;