import { DataTypes } from 'sequelize';
import sequelize from '../config.js';
import { BaseModel } from '../base/BaseModel.js';

export type UsageLogStatus = 'success' | 'failure';
export type UsageLogErrorType = 'rate_limit' | 'content_moderation' | 'other' | null;

export interface UsageLogAttributes {
  id: string;
  user_id: string;
  feature: string;
  cost: number;
  credits_used: number;
  tokens_used: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  tts_characters: number | null;
  status: UsageLogStatus;
  error_type: UsageLogErrorType;
  created_at?: Date;
}

export class UsageLog extends BaseModel<UsageLogAttributes> implements UsageLogAttributes {
  declare id: string;
  declare user_id: string;
  declare feature: string;
  declare cost: number;
  declare credits_used: number;
  declare tokens_used: number | null;
  declare input_tokens: number | null;
  declare output_tokens: number | null;
  declare tts_characters: number | null;
  declare status: UsageLogStatus;
  declare error_type: UsageLogErrorType;
  declare created_at: Date;
}

UsageLog.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    feature: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    cost: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
    },
    credits_used: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tokens_used: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    input_tokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    output_tokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    tts_characters: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'success',
    },
    error_type: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'usage_logs',
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ['user_id'], name: 'idx_usage_logs_user_id' },
      { fields: ['feature'], name: 'idx_usage_logs_feature' },
      { fields: ['created_at'], name: 'idx_usage_logs_created_at' },
      { fields: ['status'], name: 'idx_usage_logs_status' },
      { fields: ['error_type'], name: 'idx_usage_logs_error_type' },
    ],
  }
);
