import { randomUUID } from 'crypto';
import { Notification, User, CompanyProfile, Job, Candidate, Application } from '../db/models/index.js';
import type { NotificationType } from '../db/models/Notification.js';

/**
 * Notification Service — creates in-app notifications for various events.
 * Called from controllers whenever an event that should trigger a notification occurs.
 */
export class NotificationService {
  /**
   * Create a notification for a specific user.
   */
  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<void> {
    try {
      await Notification.create({
        id: randomUUID(),
        user_id: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data || null,
        read: false,
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  }

  /**
   * Notify company when a new application is received.
   */
  async notifyApplicationReceived(applicationId: string, jobId: string, candidateId: string): Promise<void> {
    try {
      const job = await Job.findByPk(jobId, {
        include: [{ model: CompanyProfile, as: 'companyProfile' }],
      });
      if (!job) return;

      const companyProfile = (job as any).companyProfile;
      if (!companyProfile) return;

      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate) return;

      // Get the company user
      const companyUser = await User.findOne({ where: { id: companyProfile.user_id } });
      if (!companyUser) return;

      await this.create({
        userId: companyUser.id,
        type: 'application_received',
        title: 'New Application Received',
        body: `${candidate.name} applied for ${job.title}`,
        data: {
          applicationId,
          jobId,
          candidateId,
          jobTitle: job.title,
          candidateName: candidate.name,
        },
      });
    } catch (error) {
      console.error('Failed to notify application received:', error);
    }
  }

  /**
   * Notify candidate when their application status changes.
   */
  async notifyStatusChanged(
    applicationId: string,
    candidateId: string,
    jobId: string,
    newStatus: string
  ): Promise<void> {
    try {
      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate || !candidate.user_id) return;

      const job = await Job.findByPk(jobId);
      if (!job) return;

      const statusMessages: Record<string, string> = {
        screening: `Your application for "${job.title}" is being reviewed`,
        interview: `Congratulations! You've been selected for an interview for "${job.title}"`,
        offer: `Great news! You've received an offer for "${job.title}"`,
        hired: `Congratulations! You've been hired for "${job.title}"`,
        rejected: `Your application for "${job.title}" has been declined`,
      };

      const statusTitles: Record<string, string> = {
        screening: 'Application Under Review',
        interview: 'Interview Invitation',
        offer: 'Offer Received',
        hired: 'You\'re Hired!',
        rejected: 'Application Update',
      };

      const type: NotificationType =
        newStatus === 'rejected' ? 'rejected' :
        newStatus === 'screening' || newStatus === 'interview' ? 'shortlisted' :
        'status_changed';

      await this.create({
        userId: candidate.user_id,
        type,
        title: statusTitles[newStatus] || 'Application Status Update',
        body: statusMessages[newStatus] || `Your application status has been updated to "${newStatus}"`,
        data: {
          applicationId,
          jobId,
          candidateId,
          jobTitle: job.title,
          newStatus,
        },
      });
    } catch (error) {
      console.error('Failed to notify status changed:', error);
    }
  }

  /**
   * Notify candidate when a new AI match is found.
   */
  async notifyNewMatch(candidateId: string, jobId: string, score: number): Promise<void> {
    try {
      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate || !candidate.user_id) return;

      const job = await Job.findByPk(jobId);
      if (!job) return;

      await this.create({
        userId: candidate.user_id,
        type: 'new_match',
        title: 'New Job Match Found',
        body: `You're a ${Math.round(score)}% match for "${job.title}"`,
        data: {
          jobId,
          candidateId,
          jobTitle: job.title,
          score,
        },
      });
    } catch (error) {
      console.error('Failed to notify new match:', error);
    }
  }

  async notifyInterviewAssigned(
    candidateId: string,
    jobId: string,
    assessmentId: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate?.user_id) return;
      const job = await Job.findByPk(jobId);
      if (!job) return;

      await this.create({
        userId: candidate.user_id,
        type: 'interview_assigned',
        title: 'Behavior Assessment Assigned',
        body: `Your interview assessment for "${job.title}" is ready. Please complete it within 24 hours.`,
        data: {
          jobId,
          candidateId,
          assessmentId,
          expiresAt,
        },
      });
    } catch (error) {
      console.error('Failed to notify interview assigned:', error);
    }
  }

  async notifyInterviewDeadlineReminder(
    candidateId: string,
    jobId: string,
    assessmentId: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate?.user_id) return;
      const job = await Job.findByPk(jobId);
      if (!job) return;

      await this.create({
        userId: candidate.user_id,
        type: 'interview_deadline_reminder',
        title: 'Interview Deadline Reminder',
        body: `Your assessment for "${job.title}" expires soon. Please submit before the deadline.`,
        data: {
          jobId,
          candidateId,
          assessmentId,
          expiresAt,
        },
      });
    } catch (error) {
      console.error('Failed to notify interview reminder:', error);
    }
  }

  async notifyInterviewExpired(
    candidateId: string,
    jobId: string,
    assessmentId: string
  ): Promise<void> {
    try {
      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate?.user_id) return;
      const job = await Job.findByPk(jobId);
      if (!job) return;

      await this.create({
        userId: candidate.user_id,
        type: 'interview_expired',
        title: 'Interview Assessment Expired',
        body: `Your assessment window for "${job.title}" has expired. Contact the hiring team to request a new one.`,
        data: {
          jobId,
          candidateId,
          assessmentId,
        },
      });
    } catch (error) {
      console.error('Failed to notify interview expired:', error);
    }
  }

  async notifyInterviewReportReady(
    candidateId: string,
    jobId: string,
    assessmentId: string,
    score: number
  ): Promise<void> {
    try {
      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate?.user_id) return;
      const job = await Job.findByPk(jobId);
      if (!job) return;

      await this.create({
        userId: candidate.user_id,
        type: 'interview_report_ready',
        title: 'Interview Assessment Completed',
        body: `Your assessment report for "${job.title}" is ready. Score: ${Math.round(score)}/100.`,
        data: {
          jobId,
          candidateId,
          assessmentId,
          score,
        },
      });
    } catch (error) {
      console.error('Failed to notify interview report ready:', error);
    }
  }
}

export const notificationService = new NotificationService();
