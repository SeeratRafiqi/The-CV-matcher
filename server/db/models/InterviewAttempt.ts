import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export type InterviewAttemptStatus = 'in_progress' | 'submitted' | 'expired';

export interface InterviewAttemptAttributes {
  id: string;
  assessment_id: string;
  candidate_id: string;
  started_at?: Date;
  submitted_at?: Date | null;
  auto_submitted?: boolean;
  status: InterviewAttemptStatus;
  remaining_seconds_snapshot?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export class InterviewAttempt extends BaseModel<InterviewAttemptAttributes> implements InterviewAttemptAttributes {
  declare id: string;
  declare assessment_id: string;
  declare candidate_id: string;
  declare started_at: Date;
  declare submitted_at: Date | null;
  declare auto_submitted: boolean;
  declare status: InterviewAttemptStatus;
  declare remaining_seconds_snapshot: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InterviewAttempt.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    assessment_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
      references: {
        model: 'interview_assessments',
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
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    status: {
      type: DataTypes.ENUM('in_progress', 'submitted', 'expired'),
      allowNull: false,
      defaultValue: 'in_progress',
    },
    remaining_seconds_snapshot: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    tableName: 'interview_attempts',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['candidate_id', 'status'],
        name: 'idx_interview_attempt_candidate_status',
      },
    ],
  }
);
