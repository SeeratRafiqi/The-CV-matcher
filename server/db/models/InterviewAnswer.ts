import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export interface InterviewAnswerAttributes {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option?: string | null;
  answered_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export class InterviewAnswer extends BaseModel<InterviewAnswerAttributes> implements InterviewAnswerAttributes {
  declare id: string;
  declare attempt_id: string;
  declare question_id: string;
  declare selected_option: string | null;
  declare answered_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InterviewAnswer.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    attempt_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'interview_attempts',
        key: 'id',
      },
    },
    question_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: 'interview_questions',
        key: 'id',
      },
    },
    selected_option: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    answered_at: {
      type: DataTypes.DATE,
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
    tableName: 'interview_answers',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['attempt_id', 'question_id'],
        name: 'idx_interview_answer_attempt_question',
      },
    ],
  }
);
