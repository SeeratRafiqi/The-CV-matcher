import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export type InterviewAssessmentStatus = 'assigned' | 'in_progress' | 'submitted' | 'expired';

export interface InterviewAssessmentAttributes {
  id: string;
  application_id: string;
  candidate_id: string;
  assigned_by: string;
  assigned_at?: Date;
  expires_at: Date;
  duration_minutes: number;
  max_questions: number;
  status: InterviewAssessmentStatus;
  started_at?: Date | null;
  submitted_at?: Date | null;
  auto_submitted?: boolean;
  reminder_sent_at?: Date | null;
  expiry_notified_at?: Date | null;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class InterviewAssessment extends BaseModel<InterviewAssessmentAttributes> implements InterviewAssessmentAttributes {
  declare id: string;
  declare application_id: string;
  declare candidate_id: string;
  declare assigned_by: string;
  declare assigned_at: Date;
  declare expires_at: Date;
  declare duration_minutes: number;
  declare max_questions: number;
  declare status: InterviewAssessmentStatus;
  declare started_at: Date | null;
  declare submitted_at: Date | null;
  declare auto_submitted: boolean;
  declare reminder_sent_at: Date | null;
  declare expiry_notified_at: Date | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

InterviewAssessment.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    application_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    candidate_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'candidates',
        key: 'id',
      },
    },
    assigned_by: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    assigned_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    duration_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
    },
    max_questions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    status: {
      type: DataTypes.ENUM('assigned', 'in_progress', 'submitted', 'expired'),
      allowNull: false,
      defaultValue: 'assigned',
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    auto_submitted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    reminder_sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiry_notified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'interview_assessments',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['application_id', 'is_active'],
        name: 'idx_interview_assessment_application_active',
      },
      {
        fields: ['candidate_id', 'status'],
        name: 'idx_interview_assessment_candidate_status',
      },
      {
        fields: ['expires_at', 'status'],
        name: 'idx_interview_assessment_expiry_status',
      },
    ],
  }
);
