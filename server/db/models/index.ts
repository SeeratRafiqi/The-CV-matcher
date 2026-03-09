import sequelize from '../config.js';
import { User } from './User.js';
import { Candidate } from './Candidate.js';
import { CompanyProfile } from './CompanyProfile.js';
import { CvFile } from './CvFile.js';
import { CandidateMatrix } from './CandidateMatrix.js';
import { Job } from './Job.js';
import { JobMatrix } from './JobMatrix.js';
import { Match } from './Match.js';
import { Application } from './Application.js';
import { AdminNote } from './AdminNote.js';
import { CandidateTag } from './CandidateTag.js';
import { JobReport } from './JobReport.js';
import { PipelineStage } from './PipelineStage.js';
import { Notification } from './Notification.js';
import { ApplicationHistory } from './ApplicationHistory.js';
import { Conversation } from './Conversation.js';
import { Message } from './Message.js';
import { SavedJob } from './SavedJob.js';
import { CompanyMember } from './CompanyMember.js';
import { CoverLetter } from './CoverLetter.js';
import { InterviewAssessment } from './InterviewAssessment.js';
import { InterviewQuestion } from './InterviewQuestion.js';
import { InterviewAttempt } from './InterviewAttempt.js';
import { InterviewAnswer } from './InterviewAnswer.js';
import { InterviewReport } from './InterviewReport.js';
import { TailoredResume } from './TailoredResume.js';

// === User associations ===
User.hasOne(Candidate, { foreignKey: 'user_id', as: 'candidateProfile' });
Candidate.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasOne(CompanyProfile, { foreignKey: 'user_id', as: 'companyProfile' });
CompanyProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// === Candidate associations ===
Candidate.hasMany(CvFile, { foreignKey: 'candidate_id', as: 'cvFiles' });
CvFile.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

Candidate.hasMany(CandidateMatrix, { foreignKey: 'candidate_id', as: 'matrices' });
CandidateMatrix.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

CvFile.hasOne(CandidateMatrix, { foreignKey: 'cv_file_id', as: 'matrix' });
CandidateMatrix.belongsTo(CvFile, { foreignKey: 'cv_file_id', as: 'cvFile' });

// === Company → Jobs ===
CompanyProfile.hasMany(Job, { foreignKey: 'company_id', as: 'jobs' });
Job.belongsTo(CompanyProfile, { foreignKey: 'company_id', as: 'companyProfile' });

// === Job associations ===
Job.hasOne(JobMatrix, { foreignKey: 'job_id', as: 'matrix' });
JobMatrix.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

// === Match associations ===
Candidate.hasMany(Match, { foreignKey: 'candidate_id', as: 'matches' });
Match.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

Job.hasMany(Match, { foreignKey: 'job_id', as: 'matches' });
Match.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

// === Application associations ===
Candidate.hasMany(Application, { foreignKey: 'candidate_id', as: 'applications' });
Application.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

Job.hasMany(Application, { foreignKey: 'job_id', as: 'applications' });
Application.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

Match.hasOne(Application, { foreignKey: 'match_id', as: 'application' });
Application.belongsTo(Match, { foreignKey: 'match_id', as: 'match' });

// === Notes & Tags ===
Candidate.hasMany(AdminNote, { foreignKey: 'candidate_id', as: 'notes' });
AdminNote.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

Candidate.hasMany(CandidateTag, { foreignKey: 'candidate_id', as: 'tags' });
CandidateTag.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

// === Reports ===
Job.hasMany(JobReport, { foreignKey: 'job_id', as: 'reports' });
JobReport.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

// === Pipeline Stages (Phase 3) ===
CompanyProfile.hasMany(PipelineStage, { foreignKey: 'company_id', as: 'pipelineStages' });
PipelineStage.belongsTo(CompanyProfile, { foreignKey: 'company_id', as: 'companyProfile' });

PipelineStage.hasMany(Application, { foreignKey: 'pipeline_stage_id', as: 'applications' });
Application.belongsTo(PipelineStage, { foreignKey: 'pipeline_stage_id', as: 'pipelineStage' });

// === Notifications (Phase 3) ===
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// === Application History (Phase 3) ===
Application.hasMany(ApplicationHistory, { foreignKey: 'application_id', as: 'history' });
ApplicationHistory.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

User.hasMany(ApplicationHistory, { foreignKey: 'changed_by', as: 'applicationChanges' });
ApplicationHistory.belongsTo(User, { foreignKey: 'changed_by', as: 'changedByUser' });

// === Conversations (Phase 4) ===
User.hasMany(Conversation, { foreignKey: 'participant_1_id', as: 'conversationsAsParticipant1' });
User.hasMany(Conversation, { foreignKey: 'participant_2_id', as: 'conversationsAsParticipant2' });
Conversation.belongsTo(User, { foreignKey: 'participant_1_id', as: 'participant1' });
Conversation.belongsTo(User, { foreignKey: 'participant_2_id', as: 'participant2' });
Conversation.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });
Conversation.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

// === Messages (Phase 4) ===
Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sentMessages' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

// === Saved Jobs (Phase 4) ===
Candidate.hasMany(SavedJob, { foreignKey: 'candidate_id', as: 'savedJobs' });
SavedJob.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });
Job.hasMany(SavedJob, { foreignKey: 'job_id', as: 'saves' });
SavedJob.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

// === Tailored Resumes (per candidate + job) ===
Candidate.hasMany(TailoredResume, { foreignKey: 'candidate_id', as: 'tailoredResumes' });
TailoredResume.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });
Job.hasMany(TailoredResume, { foreignKey: 'job_id', as: 'tailoredResumes' });
TailoredResume.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

// === Company Members (Phase 5) ===
CompanyProfile.hasMany(CompanyMember, { foreignKey: 'company_id', as: 'members' });
CompanyMember.belongsTo(CompanyProfile, { foreignKey: 'company_id', as: 'company' });

User.hasMany(CompanyMember, { foreignKey: 'user_id', as: 'companyMemberships' });
CompanyMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(CompanyMember, { foreignKey: 'invited_by', as: 'invitedMembers' });
CompanyMember.belongsTo(User, { foreignKey: 'invited_by', as: 'inviter' });

// === Cover Letters ===
Candidate.hasMany(CoverLetter, { foreignKey: 'candidate_id', as: 'coverLetters' });
CoverLetter.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });
Job.hasMany(CoverLetter, { foreignKey: 'job_id', as: 'coverLetters' });
CoverLetter.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

// === Interview Assessments ===
Application.hasMany(InterviewAssessment, { foreignKey: 'application_id', as: 'interviewAssessments' });
InterviewAssessment.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });
Candidate.hasMany(InterviewAssessment, { foreignKey: 'candidate_id', as: 'interviewAssessments' });
InterviewAssessment.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });
User.hasMany(InterviewAssessment, { foreignKey: 'assigned_by', as: 'assignedInterviews' });
InterviewAssessment.belongsTo(User, { foreignKey: 'assigned_by', as: 'assignedByUser' });

InterviewAssessment.hasMany(InterviewQuestion, { foreignKey: 'assessment_id', as: 'questions' });
InterviewQuestion.belongsTo(InterviewAssessment, { foreignKey: 'assessment_id', as: 'assessment' });

InterviewAssessment.hasOne(InterviewAttempt, { foreignKey: 'assessment_id', as: 'attempt' });
InterviewAttempt.belongsTo(InterviewAssessment, { foreignKey: 'assessment_id', as: 'assessment' });
Candidate.hasMany(InterviewAttempt, { foreignKey: 'candidate_id', as: 'interviewAttempts' });
InterviewAttempt.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });

InterviewAttempt.hasMany(InterviewAnswer, { foreignKey: 'attempt_id', as: 'answers' });
InterviewAnswer.belongsTo(InterviewAttempt, { foreignKey: 'attempt_id', as: 'attempt' });
InterviewQuestion.hasMany(InterviewAnswer, { foreignKey: 'question_id', as: 'answers' });
InterviewAnswer.belongsTo(InterviewQuestion, { foreignKey: 'question_id', as: 'question' });

InterviewAttempt.hasOne(InterviewReport, { foreignKey: 'attempt_id', as: 'report' });
InterviewReport.belongsTo(InterviewAttempt, { foreignKey: 'attempt_id', as: 'attempt' });

export {
  sequelize,
  User,
  Candidate,
  CompanyProfile,
  CvFile,
  CandidateMatrix,
  Job,
  JobMatrix,
  Match,
  Application,
  AdminNote,
  CandidateTag,
  JobReport,
  PipelineStage,
  Notification,
  ApplicationHistory,
  Conversation,
  Message,
  SavedJob,
  CompanyMember,
  CoverLetter,
  InterviewAssessment,
  InterviewQuestion,
  InterviewAttempt,
  InterviewAnswer,
  InterviewReport,
  TailoredResume,
};
