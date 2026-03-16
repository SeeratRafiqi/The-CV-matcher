import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export type VoiceInterviewStatus = 'assigned' | 'in_progress' | 'completed' | 'expired';

export interface VoiceInterviewSessionAttributes {
  id: string;
  application_id: string;
  candidate_id: string;
  job_id: string;
  status: VoiceInterviewStatus;
  questions: string;
  answers: string;
  current_question_index: number;
  max_questions: number;
  duration_minutes?: number;
  started_at?: Date | null;
  completed_at?: Date | null;
  outcome?: string | null;
  conductor_state?: string | null;
  expires_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class VoiceInterviewSession
  extends BaseModel<VoiceInterviewSessionAttributes>
  implements VoiceInterviewSessionAttributes
{
  declare id: string;
  declare application_id: string;
  declare candidate_id: string;
  declare job_id: string;
  declare status: VoiceInterviewStatus;
  declare questions: string;
  declare answers: string;
  declare current_question_index: number;
  declare max_questions: number;
  declare duration_minutes: number | null;
  declare started_at: Date | null;
  declare completed_at: Date | null;
  declare outcome: string | null;
  declare conductor_state: string | null;
  declare expires_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

VoiceInterviewSession.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    application_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: { model: 'applications', key: 'id' },
      onDelete: 'CASCADE',
    },
    candidate_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: { model: 'candidates', key: 'id' },
      onDelete: 'CASCADE',
    },
    job_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: { model: 'jobs', key: 'id' },
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'assigned',
    },
    questions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    },
    answers: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    },
    current_question_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_questions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 6,
    },
    duration_minutes: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 10 },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    outcome: { type: DataTypes.TEXT, allowNull: true },
    conductor_state: { type: DataTypes.TEXT, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
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
    tableName: 'voice_interview_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { fields: ['application_id'], name: 'idx_voice_interview_application' },
      { fields: ['candidate_id', 'status'], name: 'idx_voice_interview_candidate_status' },
    ],
  }
);
