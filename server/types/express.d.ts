// Declaration merging to extend Express Request with user property
declare namespace Express {
  interface Request {
    user?: {
      id: string;
      userId: string;
      email: string;
      plan: string;
      isAdmin: boolean;
      workspaceOwnerId?: string | null;
    };
  }
}

export {};
