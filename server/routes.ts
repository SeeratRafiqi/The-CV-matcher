import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import path from "path";
import authRoutes from "./routes/auth.js";
import candidateRoutes from "./routes/candidates.js";
import cvRoutes from "./routes/cv.js";
import jobRoutes, { companyJobRouter } from "./routes/jobs.js";
import matchRoutes from "./routes/matches.js";
import noteRoutes from "./routes/notes.js";
import tagRoutes from "./routes/tags.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportRoutes from "./routes/reports.js";
import bulkOperationsRoutes from "./routes/bulkOperations.js";
import profileRoutes from "./routes/profile.js";
import applicationRoutes from "./routes/applications.js";
import pipelineRoutes from "./routes/pipeline.js";
import notificationRoutes from "./routes/notifications.js";
import conversationRoutes from "./routes/conversations.js";
import analyticsRoutes from "./routes/analytics.js";
import savedJobRoutes from "./routes/savedJobs.js";
import teamRoutes from "./routes/team.js";
import aiRoutes from "./routes/ai.js";
import coverLetterRoutes from "./routes/coverLetters.js";
import interviewRoutes from "./routes/interviews.js";
import { sanitizeStrings } from "./middleware/validate.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve uploaded files (photos, logos) as static
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Global XSS sanitizer
  app.use("/api", sanitizeStrings);

  // Register all API routes
  app.use("/api/auth", authRoutes);
  app.use("/api", profileRoutes); // Profile routes (/api/candidate/profile, /api/company/profile)
  app.use("/api/candidates", candidateRoutes);
  app.use("/api/cv", cvRoutes);
  app.use("/api/jobs", jobRoutes); // Admin/general job routes
  app.use("/api/company/jobs", companyJobRouter); // Company-specific job management
  app.use("/api", applicationRoutes); // Job browsing + applications
  app.use("/api/matches", matchRoutes);
  app.use("/api/candidates", noteRoutes); // Notes are under candidates
  app.use("/api/candidates", tagRoutes); // Tags are under candidates
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api", reportRoutes); // Reports routes
  app.use("/api/bulk-operations", bulkOperationsRoutes);
  app.use("/api/pipeline", pipelineRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/saved-jobs", savedJobRoutes);
  app.use("/api/company/members", teamRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/cover-letters", coverLetterRoutes);
  app.use("/api/interviews", interviewRoutes);

  return httpServer;
}
