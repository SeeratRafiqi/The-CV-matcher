import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import {
  getInterviewAssessment,
  getInterviewAssessmentReport,
  saveInterviewAnswer,
  startInterviewAssessment,
  submitInterviewAssessment,
} from '@/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/utils/helpers';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Send, Timer } from 'lucide-react';
import type { InterviewAssessment, InterviewAssessmentReport, InterviewAssessmentStatus } from '@/types';

const statusVariant: Record<InterviewAssessmentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  assigned: 'secondary',
  in_progress: 'default',
  submitted: 'default',
  expired: 'destructive',
};

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${minutes}:${sec.toString().padStart(2, '0')}`;
}

function getInitialAnswers(assessment?: InterviewAssessment) {
  const answers: Record<string, string | null> = {};
  (assessment?.questions || []).forEach((q) => {
    answers[q.id] = q.selectedOption || null;
  });
  return answers;
}

export default function CandidateInterviewAssessment() {
  const [, params] = useRoute('/candidate/interviews/:id');
  const assessmentId = params?.id || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const autoSubmitTriggered = useRef(false);

  const assessmentQuery = useQuery({
    queryKey: ['candidate-interview', assessmentId],
    queryFn: () => getInterviewAssessment(assessmentId),
    enabled: !!assessmentId,
    refetchInterval: 10000,
  });

  const assessment = assessmentQuery.data?.assessment;

  useEffect(() => {
    if (!assessment) return;
    setAnswers(getInitialAnswers(assessment));
    setRemainingSeconds(assessment.remainingSeconds);
  }, [assessment?.id, assessment?.remainingSeconds, assessment?.status]);

  useEffect(() => {
    if (!assessment || assessment.status !== 'in_progress') return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [assessment?.status]);

  const startMutation = useMutation({
    mutationFn: () => startInterviewAssessment(assessmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-interview', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews'] });
    },
    onError: (error: any) => {
      toast({ title: 'Unable to start assessment', description: error.message, variant: 'destructive' });
    },
  });

  const saveAnswerMutation = useMutation({
    mutationFn: ({ questionId, selectedOption }: { questionId: string; selectedOption: string }) =>
      saveInterviewAnswer(assessmentId, questionId, selectedOption),
    onError: (error: any) => {
      toast({ title: 'Could not save answer', description: error.message, variant: 'destructive' });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (autoSubmitted: boolean) => submitInterviewAssessment(assessmentId, autoSubmitted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-interview', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-interview-report', assessmentId] });
      toast({ title: 'Assessment submitted', description: 'Your report is ready.' });
    },
    onError: (error: any) => {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
      autoSubmitTriggered.current = false;
    },
  });

  useEffect(() => {
    if (!assessment) return;
    if (assessment.status !== 'in_progress') return;
    if (remainingSeconds > 0) return;
    if (autoSubmitTriggered.current) return;

    autoSubmitTriggered.current = true;
    submitMutation.mutate(true);
  }, [assessment?.status, remainingSeconds, submitMutation]);

  const reportQuery = useQuery({
    queryKey: ['candidate-interview-report', assessmentId],
    queryFn: () => getInterviewAssessmentReport(assessmentId),
    enabled: !!assessmentId && assessment?.status === 'submitted',
  });

  const report: InterviewAssessmentReport | undefined = reportQuery.data?.report;

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => !!value).length,
    [answers]
  );
  const totalQuestions = assessment?.questions.length || 0;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const handleSelect = (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    saveAnswerMutation.mutate({ questionId, selectedOption: option });
  };

  if (assessmentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Assessment not found.</p>
          <Link href="/candidate/interviews">
            <Button variant="outline" className="mt-4">Back to Assessments</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const currentQuestion = assessment.questions[activeQuestion];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/candidate/interviews">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{assessment.job?.title || 'Behavior Assessment'}</h1>
          <p className="text-muted-foreground">Deadline: {formatDateTime(assessment.expiresAt)}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={statusVariant[assessment.status]} className="capitalize">{assessment.status.replace('_', ' ')}</Badge>
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {answeredCount}/{totalQuestions} answered
              </span>
              <span className={`inline-flex items-center gap-1 ${remainingSeconds <= 120 ? 'text-red-600' : ''}`}>
                <Timer className="w-4 h-4" />
                {formatCountdown(remainingSeconds)}
              </span>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </CardHeader>
      </Card>

      {assessment.status === 'assigned' && (
        <Card>
          <CardHeader>
            <CardTitle>Before You Start</CardTitle>
            <CardDescription>
              You have one attempt. The timer is {assessment.durationMinutes} minutes and auto-submits on timeout.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>- {assessment.maxQuestions} multiple-choice behavior questions</p>
              <p>- One-day deadline from assignment</p>
              <p>- Auto-scored report generated after submission</p>
            </div>
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              {startMutation.isPending ? 'Starting...' : 'Start Assessment'}
            </Button>
          </CardContent>
        </Card>
      )}

      {assessment.status === 'in_progress' && currentQuestion && (
        <Card>
          <CardHeader>
            <CardTitle>
              Question {activeQuestion + 1} of {totalQuestions}
            </CardTitle>
            <CardDescription>{currentQuestion.competencyTag || 'behavior'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-medium">{currentQuestion.question}</p>
            <div className="space-y-2">
              {currentQuestion.options.map((option) => {
                const selected = answers[currentQuestion.id] === option;
                return (
                  <Button
                    key={option}
                    variant={selected ? 'default' : 'outline'}
                    className="w-full justify-start h-auto py-3 whitespace-normal text-left"
                    onClick={() => handleSelect(currentQuestion.id, option)}
                  >
                    {option}
                  </Button>
                );
              })}
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setActiveQuestion((prev) => Math.max(0, prev - 1))}
                disabled={activeQuestion === 0}
              >
                Previous
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setActiveQuestion((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  disabled={activeQuestion >= totalQuestions - 1}
                >
                  Next
                </Button>
                <Button
                  onClick={() => submitMutation.mutate(false)}
                  disabled={submitMutation.isPending}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  Submit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {assessment.status === 'expired' && (
        <Card className="border-red-300/60">
          <CardContent className="py-8 text-center space-y-2">
            <AlertTriangle className="w-10 h-10 mx-auto text-red-600" />
            <p className="font-medium">Assessment expired</p>
            <p className="text-sm text-muted-foreground">
              The 24-hour deadline passed. The hiring team must reissue a new assessment.
            </p>
          </CardContent>
        </Card>
      )}

      {assessment.status === 'submitted' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Assessment Report
            </CardTitle>
            <CardDescription>Auto-generated behavioral fit report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reportQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !report ? (
              <p className="text-sm text-muted-foreground">Report is being prepared. Please refresh shortly.</p>
            ) : (
              <>
                <div className="text-2xl font-bold">{Math.round(report.overallScore)}/100</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(report.dimensionScores || {}).map(([key, value]) => (
                    <div key={key} className="text-sm border rounded-md px-3 py-2 flex items-center justify-between">
                      <span className="capitalize">{key.replace('_', ' ')}</span>
                      <span className="font-medium">{Math.round(value)}/100</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Strengths</p>
                  {(report.strengths || []).map((item, idx) => (
                    <p key={idx} className="text-sm text-muted-foreground">- {item}</p>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Concerns</p>
                  {(report.concerns || []).map((item, idx) => (
                    <p key={idx} className="text-sm text-muted-foreground">- {item}</p>
                  ))}
                </div>
                <div className="rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium mb-1">Recommendation</p>
                  <p className="text-muted-foreground">{report.recommendation}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
