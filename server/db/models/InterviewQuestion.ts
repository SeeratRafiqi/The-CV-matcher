import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export interface InterviewQuestionAttributes {
  id: string;
  assessment_id: string;
  question_text: string;
  options: string[];
  correct_option: string;
  competency_tag?: string;
  weight: number;
  order_index: number;
  created_at?: Date;
}

export class InterviewQuestion extends BaseModel<InterviewQuestionAttributes> implements InterviewQuestionAttributes {
  declare id: string;
  declare assessment_id: string;
  declare question_text: string;
  declare options: string[];
  declare correct_option: string;
  declare competency_tag?: string;
  declare weight: number;
  declare order_index: number;
  declare created_at: Date;
}

InterviewQuestion.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    assessment_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'interview_assessments',
        key: 'id',
      },
    },
    question_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    options: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    correct_option: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    competency_tag: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    weight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    order_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'interview_questions',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['assessment_id', 'order_index'],
        name: 'idx_interview_questions_assessment_order',
      },
    ],
  }
);
