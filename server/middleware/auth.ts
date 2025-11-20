import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { storage } from '../storage';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    userId: string; // Add userId alias for compatibility
    email: string;
    plan: string;
    isAdmin: boolean;
    workspaceOwnerId?: string | null;
  };
}

// Alias for compatibility with existing routes
export interface AuthRequest extends AuthenticatedRequest {}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      userId: user.id, // Add userId alias for compatibility
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
      workspaceOwnerId: user.workspaceOwnerId,
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    const user = (req as AuthenticatedRequest).user;
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    next();
  });
};

// Alias for compatibility with existing routes that use authenticateToken
export const authenticateToken = requireAuth;