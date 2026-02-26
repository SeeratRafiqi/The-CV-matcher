import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export interface InterviewReportAttributes {
  id: string;
  attempt_id: string;
  overall_score: number;
  dimension_scores: any;
  strengths: string[];
  concerns: string[];
  recommendation: string;
  raw_llm_output?: any;
  generated_at?: Date;
}

export class InterviewReport extends BaseModel<InterviewReportAttributes> implements InterviewReportAttributes {
  declare id: string;
  declare attempt_id: string;
  declare overall_score: number;
  declare dimension_scores: any;
  declare strengths: string[];
  declare concerns: string[];
  declare recommendation: string;
  declare raw_llm_output: any;
  declare generated_at: Date;
}

InterviewReport.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    attempt_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
      references: {
        model: 'interview_attempts',
        key: 'id',
      },
    },
    overall_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    dimension_scores: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    strengths: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    concerns: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    recommendation: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    raw_llm_output: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'interview_reports',
    timestamps: false,
    underscored: true,
  }
);
