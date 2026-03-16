import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export type NotificationType =
  | 'application_received'
  | 'status_changed'
  | 'shortlisted'
  | 'rejected'
  | 'new_match'
  | 'message_received'
  | 'job_expired'
  | 'interview_assigned'
  | 'interview_deadline_reminder'
  | 'interview_expired'
  | 'interview_report_ready'
  | 'role_suggestion';

export interface NotificationAttributes {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: any; // JSON — { jobId, applicationId, candidateId, etc. }
  read: boolean;
  created_at?: Date;
}

export class Notification extends BaseModel<NotificationAttributes> implements NotificationAttributes {
  declare id: string;
  declare user_id: string;
  declare type: NotificationType;
  declare title: string;
  declare body: string;
  declare data: any;
  declare read: boolean;
  declare created_at: Date;
}

Notification.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    type: {
      type: DataTypes.ENUM(
        'application_received',
        'status_changed',
        'shortlisted',
        'rejected',
        'new_match',
        'message_received',
        'job_expired',
        'interview_assigned',
        'interview_deadline_reminder',
        'interview_expired',
        'interview_report_ready',
        'role_suggestion'
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'notifications',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['user_id', 'read'],
        name: 'idx_notification_user_read',
      },
      {
        fields: ['user_id', 'created_at'],
        name: 'idx_notification_user_date',
      },
    ],
  }
);
