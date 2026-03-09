import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getMyInterviewAssessments } from '@/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/utils/helpers';
import { Clock, FileText, Timer, AlertTriangle, ArrowRight } from 'lucide-react';
import type { InterviewAssessmentStatus } from '@/types';

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

  const assessments = data?.assessments || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Interview Assessments</h1>
        <p className="text-muted-foreground">
          Complete behavior assessments within 24 hours of assignment.
        </p>
      </div>

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
    </div>
  );
}
