import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getMyInterviewAssessments, getMyVoiceInterviewSessions } from '@/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/utils/helpers';
import { Clock, FileText, Mic, Timer, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import type { InterviewAssessmentStatus, VoiceInterviewStatus } from '@/types';

const statusLabel: Record<InterviewAssessmentStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  expired: 'Expired',
};

const statusVariant: Record<InterviewAssessmentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  assigned: 'secondary',
  in_progress: 'default',
  submitted: 'default',
  expired: 'destructive',
};

const voiceStatusLabel: Record<VoiceInterviewStatus, string> = {
  assigned: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  expired: 'Expired',
};

const voiceStatusVariant: Record<VoiceInterviewStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  assigned: 'secondary',
  in_progress: 'default',
  completed: 'default',
  expired: 'destructive',
};

function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function CandidateInterviews() {
  const { data, isLoading } = useQuery({
    queryKey: ['candidate-interviews'],
    queryFn: getMyInterviewAssessments,
  });
  const { data: voiceData, isLoading: voiceLoading, refetch: refetchVoice } = useQuery({
    queryKey: ['candidate-voice-interviews'],
    queryFn: getMyVoiceInterviewSessions,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const assessments = data?.assessments || [];
  const voiceSessions = voiceData?.sessions || [];

  // Refetch voice interviews when this page is shown so new assignments appear
  useEffect(() => {
    refetchVoice();
  }, [refetchVoice]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Interviews</h1>
        <p className="text-muted-foreground">
          Behavior assessments and voice interviews assigned for your applications.
        </p>
      </div>

      {/* Voice Interviews */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Voice Interviews
        </h2>
        <p className="text-sm text-muted-foreground">
          Natural conversation-style interviews. Listen to each question and answer in your own words.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchVoice()}
            disabled={voiceLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${voiceLoading ? 'animate-spin' : ''}`} />
            Refresh list
          </Button>
        </div>
        {voiceLoading ? (
          <Skeleton className="h-24" />
        ) : voiceSessions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Mic className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No voice interviews assigned yet.</p>
              <p className="text-muted-foreground text-xs mt-1">When a recruiter assigns you a voice interview for an application, it will appear here. You can take it as soon as it’s assigned.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {voiceSessions.map((session) => (
              <Card key={session.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{session.jobTitle}</CardTitle>
                      <CardDescription>
                        Question {session.currentQuestionIndex + 1} of {session.maxQuestions}
                        {session.status === 'completed' && ' · Done'}
                      </CardDescription>
                    </div>
                    <Badge variant={voiceStatusVariant[session.status]}>{voiceStatusLabel[session.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      Expires: {formatDateTime(session.expiresAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(session.status === 'assigned' || session.status === 'in_progress') && (
                      <Link href={`/candidate/voice-interviews/${session.id}`}>
                        <Button className="gap-2">
                          {session.status === 'in_progress' ? 'Continue interview' : 'Start interview'}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                    {(session.status === 'completed' || session.status === 'expired') && (
                      <Link href={`/candidate/voice-interviews/${session.id}/report`}>
                        <Button variant="outline" className="gap-2">
                          View report
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Behavior Assessments */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Behavior Assessments
        </h2>
        <p className="text-sm text-muted-foreground">
          Complete multiple-choice assessments within 24 hours of assignment.
        </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No behavior assessments assigned yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => {
            const deadlineSoon = assessment.status !== 'submitted' && assessment.status !== 'expired' && assessment.remainingSeconds <= 6 * 60 * 60;
            return (
              <Card key={assessment.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{assessment.job?.title || 'Behavior Assessment'}</CardTitle>
                      <CardDescription>
                        {assessment.maxQuestions} questions · {assessment.durationMinutes} minutes
                      </CardDescription>
                    </div>
                    <Badge variant={statusVariant[assessment.status]}>{statusLabel[assessment.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      Deadline: {formatDateTime(assessment.expiresAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Timer className="w-4 h-4" />
                      Remaining: {formatDuration(assessment.remainingSeconds)}
                    </span>
                  </div>

                  {deadlineSoon && (
                    <div className="text-sm rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Assessment window is closing soon.
                    </div>
                  )}

                  <div>
                    <Link href={`/candidate/interviews/${assessment.id}`}>
                      <Button className="gap-2" variant={assessment.status === 'submitted' ? 'outline' : 'default'}>
                        {assessment.status === 'submitted' ? 'View Report' : assessment.status === 'expired' ? 'View Details' : 'Open Assessment'}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </section>
    </div>
  );
}
