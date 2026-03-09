import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export interface TailoredResumeAttributes {
  id: string;
  candidate_id: string;
  job_id: string;
  tailored_cv_text: string;
  structured_resume?: string | null; // JSON string
  created_at?: Date;
  updated_at?: Date;
}

export class TailoredResume extends BaseModel<TailoredResumeAttributes> implements TailoredResumeAttributes {
  declare id: string;
  declare candidate_id: string;
  declare job_id: string;
  declare tailored_cv_text: string;
  declare structured_resume: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

TailoredResume.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
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
    tailored_cv_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    structured_resume: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON string of structured resume data',
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
    tableName: 'tailored_resumes',
    timestamps: true,
    updatedAt: 'updated_at',
    createdAt: 'created_at',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['candidate_id', 'job_id'],
        name: 'idx_tailored_resumes_candidate_job',
      },
    ],
  }
);
