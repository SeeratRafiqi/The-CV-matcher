import { Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../db/config.js';
import {
  Conversation,
  Message,
  User,
  Job,
  Application,
  Candidate,
  CompanyProfile,
  Notification,
} from '../db/models/index.js';
import { BaseController } from '../db/base/BaseController.js';
import type { AuthRequest } from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { notificationService } from '../services/notificationService.js';

export class ConversationController extends BaseController {
  protected model = Conversation;

  // ==================== GET all conversations for current user ====================
  async getConversations(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const userId = req.user.id;

      const conversations = await Conversation.findAll({
        where: {
          [Op.or]: [
            { participant_1_id: userId },
            { participant_2_id: userId },
          ],
        },
        include: [
          { model: User, as: 'participant1', attributes: ['id', 'name', 'email', 'role'] },
          { model: User, as: 'participant2', attributes: ['id', 'name', 'email', 'role'] },
          { model: Job, as: 'job', attributes: ['id', 'title'], required: false },
        ],
        order: [['last_message_at', 'DESC']],
      });

      // Get unread counts and last messages for each conversation
      const result = await Promise.all(
        conversations.map(async (conv: any) => {
          const otherUser = conv.participant_1_id === userId ? conv.participant2 : conv.participant1;

          // Get last message
          const lastMessage = await Message.findOne({
            where: { conversation_id: conv.id },
            order: [['created_at', 'DESC']],
            attributes: ['id', 'content', 'sender_id', 'created_at', 'read'],
          });

          // Get unread count for this user
          const unreadCount = await Message.count({
            where: {
              conversation_id: conv.id,
              sender_id: { [Op.ne]: userId },
              read: false,
            },
          });

          // Get profile info for the other user
          let otherProfileInfo: any = null;
          if (otherUser.role === 'candidate') {
            const candidate = await Candidate.findOne({
              where: { user_id: otherUser.id },
              attributes: ['id', 'name', 'photo_url', 'headline'],
            });
            if (candidate) {
              otherProfileInfo = {
                name: candidate.name,
                photoUrl: candidate.photo_url,
                headline: candidate.headline,
              };
            }
          } else if (otherUser.role === 'company') {
            const company = await CompanyProfile.findOne({
              where: { user_id: otherUser.id },
              attributes: ['id', 'company_name', 'logo_url'],
            });
            if (company) {
              otherProfileInfo = {
                name: company.company_name,
                photoUrl: company.logo_url,
              };
            }
          }

          return {
            id: conv.id,
            otherUser: {
              id: otherUser.id,
              name: otherProfileInfo?.name || otherUser.name,
              photoUrl: otherProfileInfo?.photoUrl || null,
              headline: otherProfileInfo?.headline || null,
              role: otherUser.role,
            },
            job: conv.job ? {
              id: conv.job.id,
              title: conv.job.title,
            } : null,
            lastMessage: lastMessage ? {
              id: lastMessage.id,
              content: lastMessage.content,
              senderId: lastMessage.sender_id,
              createdAt: lastMessage.created_at,
              read: lastMessage.read,
            } : null,
            unreadCount,
            lastMessageAt: conv.last_message_at,
            createdAt: conv.created_at,
          };
        })
      );

      return result;
    });
  }

  // ==================== GET messages for a conversation ====================
  async getMessages(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const { id } = req.params;
      const userId = req.user.id;
      const { page = '1', limit = '50' } = req.query;

      // Verify user is a participant
      const conversation = await Conversation.findOne({
        where: {
          id,
          [Op.or]: [
            { participant_1_id: userId },
            { participant_2_id: userId },
          ],
        },
      });

      if (!conversation) throw Object.assign(new Error('Conversation not found'), { status: 404 });

      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);
      const offset = (pageNum - 1) * limitNum;

      // Mark unread messages as read
      await Message.update(
        { read: true },
        {
          where: {
            conversation_id: id,
            sender_id: { [Op.ne]: userId },
            read: false,
          },
        }
      );

      const { rows: messages, count: total } = await Message.findAndCountAll({
        where: { conversation_id: id },
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'role'] },
        ],
        order: [['created_at', 'ASC']],
        limit: limitNum,
        offset,
      });

      return {
        messages: messages.map((m: any) => ({
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_id,
          senderName: m.sender?.name || 'Unknown',
          senderRole: m.sender?.role || 'unknown',
          content: m.content,
          read: m.read,
          createdAt: m.created_at,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    });
  }

  // ==================== POST send a message ====================
  async sendMessage(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      if (!content || !content.trim()) {
        throw Object.assign(new Error('Message content is required'), { status: 400 });
      }

      // Verify user is a participant
      const conversation = await Conversation.findOne({
        where: {
          id,
          [Op.or]: [
            { participant_1_id: userId },
            { participant_2_id: userId },
          ],
        },
      });

      if (!conversation) throw Object.assign(new Error('Conversation not found'), { status: 404 });

      const message = await Message.create({
        id: randomUUID(),
        conversation_id: id,
        sender_id: userId,
        content: content.trim(),
        read: false,
      });

      // Update conversation last_message_at
      await conversation.update({ last_message_at: new Date() });

      // Notify the other participant
      const otherUserId = conversation.participant_1_id === userId
        ? conversation.participant_2_id
        : conversation.participant_1_id;

      notificationService.create({
        userId: otherUserId,
        type: 'message_received',
        title: 'New Message',
        body: `${req.user.name}: ${content.trim().substring(0, 100)}${content.trim().length > 100 ? '...' : ''}`,
        data: {
          conversationId: id,
          senderId: userId,
          senderName: req.user.name,
        },
      }).catch(console.error);

      return {
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        senderName: req.user.name,
        senderRole: req.user.role,
        content: message.content,
        read: message.read,
        createdAt: message.created_at,
      };
    });
  }

  // ==================== GET search users for messaging ====================
  async searchUsers(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const { q = '', role: filterRole } = req.query;
      const search = (q as string).trim();
      const currentRole = req.user.role;
      const userId = req.user.id;

      // Build where clause
      const where: any = {
        id: { [Op.ne]: userId }, // exclude self
      };

      // company/admin can message anyone; candidates can message companies
      if (currentRole === 'candidate') {
        where.role = 'company';
      } else if (filterRole && ['candidate', 'company', 'admin'].includes(filterRole as string)) {
        where.role = filterRole;
      }

      if (search) {
        where[Op.and as any] = [
          ...(where[Op.and as any] || []),
          {
            [Op.or]: [
              { name: { [Op.like]: `%${search}%` } },
              { email: { [Op.like]: `%${search}%` } },
              { username: { [Op.like]: `%${search}%` } },
            ],
          },
        ];
      }

      const users = await User.findAll({
        where,
        attributes: ['id', 'name', 'email', 'role'],
        limit: 20,
        order: [['name', 'ASC']],
      });

      // Enrich with profile info
      const result = await Promise.all(users.map(async (u: any) => {
        let photoUrl: string | null = null;
        let headline: string | null = null;

        if (u.role === 'candidate') {
          const c = await Candidate.findOne({
            where: { user_id: u.id },
            attributes: ['photo_url', 'headline', 'name'],
          });
          if (c) {
            photoUrl = c.photo_url || null;
            headline = c.headline || null;
          }
        } else if (u.role === 'company') {
          const cp = await CompanyProfile.findOne({
            where: { user_id: u.id },
            attributes: ['logo_url', 'company_name'],
          });
          if (cp) {
            photoUrl = cp.logo_url || null;
            headline = cp.company_name || null;
          }
        }

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          photoUrl,
          headline,
        };
      }));

      return result;
    });
  }

  // ==================== POST create a new conversation ====================
  async createConversation(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      // Accept both targetUserId (new) and candidateUserId (legacy)
      const { targetUserId, candidateUserId, jobId, message } = req.body;
      const recipientId = targetUserId || candidateUserId;

      if (!recipientId) {
        throw Object.assign(new Error('targetUserId is required'), { status: 400 });
      }

      if (recipientId === req.user.id) {
        throw Object.assign(new Error('Cannot message yourself'), { status: 400 });
      }

      // Verify the target user exists
      const targetUser = await User.findByPk(recipientId);
      if (!targetUser) throw Object.assign(new Error('Target user not found'), { status: 404 });

      const userId = req.user.id;

      // Determine participant order consistently (lower ID first for non-job convos)
      // For job-linked conversations keep old logic: company=p1, candidate=p2
      let p1 = userId;
      let p2 = recipientId;
      if (req.user.role === 'candidate') {
        p1 = recipientId;
        p2 = userId;
      }

      // Check if conversation already exists (check both orderings for direct messages)
      const existing = await Conversation.findOne({
        where: {
          [Op.or]: [
            { participant_1_id: p1, participant_2_id: p2 },
            { participant_1_id: p2, participant_2_id: p1 },
          ],
          ...(jobId ? { job_id: jobId } : { job_id: null }),
        },
      });

      if (existing) {
        // Conversation exists — send message there instead
        if (message) {
          await Message.create({
            id: randomUUID(),
            conversation_id: existing.id,
            sender_id: userId,
            content: message.trim(),
            read: false,
          });
          await existing.update({ last_message_at: new Date() });
        }
        return { id: existing.id, isNew: false };
      }

      // Create new conversation
      const conversation = await Conversation.create({
        id: randomUUID(),
        participant_1_id: p1,
        participant_2_id: p2,
        job_id: jobId || null,
        last_message_at: message ? new Date() : null,
      });

      // Send the first message if provided
      if (message) {
        await Message.create({
          id: randomUUID(),
          conversation_id: conversation.id,
          sender_id: userId,
          content: message.trim(),
          read: false,
        });

        // Notify the other user
        notificationService.create({
          userId: recipientId,
          type: 'message_received',
          title: 'New Message',
          body: `${req.user.name}: ${message.trim().substring(0, 100)}`,
          data: {
            conversationId: conversation.id,
            senderId: userId,
            senderName: req.user.name,
          },
        }).catch(console.error);
      }

      return { id: conversation.id, isNew: true };
    });
  }

  /** Throttle: at most one role suggestion per candidate per company per 7 days. */
  async canSendRoleSuggestion(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const candidateUserId = (req.query as any).candidateUserId;
      if (!candidateUserId) return { allowed: true, lastSentAt: null };

      const recent = await Notification.findOne({
        where: {
          user_id: candidateUserId,
          type: 'role_suggestion' as any,
          created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        order: [['created_at', 'DESC']],
        attributes: ['created_at'],
      });
      if (recent) return { allowed: false, lastSentAt: (recent as any).created_at };
      return { allowed: true, lastSentAt: null };
    });
  }

  async sendRoleSuggestion(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const { candidateUserId, jobId, suggestedJobId, suggestedJobTitle, templateType, message: messageOverride } = req.body;
      if (!candidateUserId || !jobId) throw Object.assign(new Error('candidateUserId and jobId are required'), { status: 400 });

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) throw Object.assign(new Error('Company profile not found'), { status: 404 });

      const job = await Job.findByPk(jobId, { attributes: ['id', 'title', 'company_id'] });
      if (!job || (job as any).company_id !== company.id) throw Object.assign(new Error('Job not found'), { status: 404 });

      const suggestedJob = suggestedJobId ? await Job.findByPk(suggestedJobId, { attributes: ['id', 'title', 'company_id'] }) : null;
      if (suggestedJobId && (!suggestedJob || (suggestedJob as any).company_id !== company.id)) {
        throw Object.assign(new Error('Suggested job not found'), { status: 404 });
      }

      const candidate = await Candidate.findOne({ where: { user_id: candidateUserId }, attributes: ['id', 'name'] });
      const candidateName = candidate?.name || 'there';
      const companyName = (company as any).company_name || 'The team';
      const currentJobTitle = (job as any).title || 'this role';
      const suggestedTitle = suggestedJobTitle || (suggestedJob as any)?.title || 'our other role';

      const ROLE_SUGGESTION_THROTTLE_DAYS = 7;
      const recent = await Notification.findOne({
        where: {
          user_id: candidateUserId,
          type: 'role_suggestion' as any,
          created_at: { [Op.gte]: new Date(Date.now() - ROLE_SUGGESTION_THROTTLE_DAYS * 24 * 60 * 60 * 1000) },
        },
      });
      if (recent) {
        throw Object.assign(new Error(`A role suggestion was already sent to this candidate in the last ${ROLE_SUGGESTION_THROTTLE_DAYS} days.`), { status: 429 });
      }

      const templates: Record<string, string> = {
        better_fit: `Hi ${candidateName}, we noticed your profile is a strong fit for our ${suggestedTitle} role. Would you be open to us considering you for that position as well? Best, ${companyName}`,
        both_roles: `Hi ${candidateName}, your background fits well with both our ${currentJobTitle} and ${suggestedTitle} openings. You applied for ${currentJobTitle}; we're happy to consider you for either. Would you like to be considered for both, or keep your application to ${currentJobTitle} only? Best, ${companyName}`,
      };
      const message = (messageOverride && String(messageOverride).trim()) || (templateType && templates[templateType]) || templates.better_fit;

      const recipientId = candidateUserId;
      if (recipientId === req.user.id) throw Object.assign(new Error('Cannot message yourself'), { status: 400 });

      const targetUser = await User.findByPk(recipientId);
      if (!targetUser) throw Object.assign(new Error('Candidate user not found'), { status: 404 });

      const userId = req.user.id;
      let p1 = userId;
      let p2 = recipientId;
      if (req.user.role === 'candidate') {
        p1 = recipientId;
        p2 = userId;
      }

      const existing = await Conversation.findOne({
        where: {
          [Op.or]: [
            { participant_1_id: p1, participant_2_id: p2 },
            { participant_1_id: p2, participant_2_id: p1 },
          ],
          ...(jobId ? { job_id: jobId } : { job_id: null }),
        },
      });

      let conversationId: string;
      if (existing) {
        await Message.create({
          id: randomUUID(),
          conversation_id: existing.id,
          sender_id: userId,
          content: message,
          read: false,
        });
        await existing.update({ last_message_at: new Date() });
        conversationId = existing.id;
      } else {
        const conversation = await Conversation.create({
          id: randomUUID(),
          participant_1_id: p1,
          participant_2_id: p2,
          job_id: jobId || null,
          last_message_at: new Date(),
        });
        await Message.create({
          id: randomUUID(),
          conversation_id: conversation.id,
          sender_id: userId,
          content: message,
          read: false,
        });
        conversationId = conversation.id;
      }

      await notificationService.create({
        userId: recipientId,
        type: 'role_suggestion' as any,
        title: 'Role suggestion',
        body: message.substring(0, 120) + (message.length > 120 ? '...' : ''),
        data: { conversationId, jobId, suggestedJobId, candidateUserId },
      });

      return { conversationId, sent: true };
    });
  }

  // ==================== GET unread message count ====================
  async getUnreadCount(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const userId = req.user.id;

      // Get all conversation IDs for this user
      const conversations = await Conversation.findAll({
        where: {
          [Op.or]: [
            { participant_1_id: userId },
            { participant_2_id: userId },
          ],
        },
        attributes: ['id'],
      });

      const conversationIds = conversations.map((c: any) => c.id);
      if (conversationIds.length === 0) return { unreadCount: 0 };

      const unreadCount = await Message.count({
        where: {
          conversation_id: { [Op.in]: conversationIds },
          sender_id: { [Op.ne]: userId },
          read: false,
        },
      });

      return { unreadCount };
    });
  }
}

export const conversationController = new ConversationController();
