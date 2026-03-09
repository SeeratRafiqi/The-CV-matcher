import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { getJobPublic, applyToJob, getCoverLetterForJob, generateCoverLetter, getTailoredResumeForJob } from '@/api';
import type { CoverLetterTone } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ScoreBadge } from '@/components/ScoreBadge';
import { BreakdownBar } from '@/components/BreakdownBar';
import { useToast } from '@/hooks/use-toast';
import { formatDate, getCountryFromCode } from '@/utils/helpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Users,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Clock,
  Building2,
  Globe,
  Send,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Download,
  FileEdit,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Renders job description with clear structure: sections, paragraphs, and lists. */
function JobDescriptionContent({ description }: { description: string | undefined }) {
  if (!description || !description.trim()) {
    return <p className="text-muted-foreground">No description provided.</p>;
  }

  const blocks = description.split(/\n\s*\n/).filter((b) => b.trim());
  const elements: React.ReactNode[] = [];

  function renderListItems(rawLines: string[]) {
    return (
      <ul className="list-none space-y-2.5 my-4 pl-0">
        {rawLines.map((line, j) => (
          <li key={j} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="text-primary mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{line.replace(/^[\-\*•]\s+/, '').replace(/^\d+[\.\)]\s+/, '').trim()}</span>
          </li>
        ))}
      </ul>
    );
  }

  function isSectionHeader(line: string) {
    return line.length < 80 && (line.endsWith(':') || /^(about|responsibilities|requirements|what you'll|what we|key|qualifications|role|overview|benefits)/i.test(line));
  }

  function isListItem(line: string) {
    return /^[\-\*•]\s+/.test(line) || /^\d+[\.\)]\s+/.test(line);
  }

  blocks.forEach((block, blockIdx) => {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const first = lines[0];
    const rest = lines.slice(1);
    const listItems = lines.filter(isListItem);

    if (isSectionHeader(first) && rest.length > 0) {
      elements.push(
        <h4 key={`h-${blockIdx}`} className="text-base font-semibold text-foreground mt-6 mb-2 first:mt-0">
          {first.replace(/:$/, '').trim()}
        </h4>
      );
      if (listItems.length >= 1) {
        elements.push(
          <div key={`ul-${blockIdx}`}>
            {renderListItems(listItems)}
          </div>
        );
      }
      rest.filter((l) => !isListItem(l)).forEach((line, j) => {
        if (line) {
          elements.push(
            <p key={`p-${blockIdx}-${j}`} className="text-[15px] leading-relaxed text-foreground/90 mb-3">
              {line}
            </p>
          );
        }
      });
      return;
    }

    if (isSectionHeader(first) && rest.length === 0) {
      elements.push(
        <h4 key={`h-${blockIdx}`} className="text-base font-semibold text-foreground mt-6 mb-2 first:mt-0">
          {first.replace(/:$/, '').trim()}
        </h4>
      );
      return;
    }

    if (listItems.length >= 2) {
      elements.push(
        <div key={`ul-${blockIdx}`}>
          {renderListItems(listItems)}
        </div>
      );
      rest.filter((l) => !isListItem(l)).forEach((line, j) => {
        if (line) {
          elements.push(
            <p key={`p-${blockIdx}-${j}`} className="text-[15px] leading-relaxed text-foreground/90 mb-3">
              {line}
            </p>
          );
        }
      });
      return;
    }

    lines.forEach((line, j) => {
      elements.push(
        <p key={`p-${blockIdx}-${j}`} className="text-[15px] leading-relaxed text-foreground/90 mb-3 last:mb-0">
          {line}
        </p>
      );
    });
  });

  return (
    <div className="job-description max-w-none">
      {elements.length > 0 ? elements : (
        <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">{description}</p>
      )}
    </div>
  );
}

export default function CandidateJobDetail() {
  const [, params] = useRoute('/candidate/jobs/:id');
  const jobId = params?.id || '';
  const { toast } = useToast();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [coverLetterSource, setCoverLetterSource] = useState<'saved' | 'manual' | 'generated' | ''>('');
  const [coverLetterTone, setCoverLetterTone] = useState<CoverLetterTone>('formal');
  const [applyCvChoice, setApplyCvChoice] = useState<'original' | 'tailored'>('original');
  const [savedTailoredForJob, setSavedTailoredForJob] = useState<{ tailoredCvText: string } | null>(null);

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job-public', jobId],
    queryFn: () => getJobPublic(jobId),
    enabled: !!jobId,
  });

  // Fetch saved cover letter for this job
  const { data: savedCoverLetter, isLoading: savedCLLoading } = useQuery({
    queryKey: ['cover-letter', jobId],
    queryFn: () => getCoverLetterForJob(jobId),
    enabled: !!jobId && user?.role === 'candidate',
  });

  // When dialog opens, auto-populate with saved cover letter
  useEffect(() => {
    if (showApplyDialog && savedCoverLetter?.content && coverLetterSource === '') {
      setCoverLetter(savedCoverLetter.content);
      setCoverLetterSource('saved');
    }
  }, [showApplyDialog, savedCoverLetter, coverLetterSource]);

  useEffect(() => {
    if (showApplyDialog && jobId) {
      getTailoredResumeForJob(jobId).then((data) => setSavedTailoredForJob(data ?? null));
    } else {
      setSavedTailoredForJob(null);
    }
  }, [showApplyDialog, jobId]);

  const applyMutation = useMutation({
    mutationFn: () =>
      applyToJob(jobId, coverLetter || undefined, {
        cvType: applyCvChoice,
        tailoredCvText: applyCvChoice === 'tailored' && savedTailoredForJob?.tailoredCvText ? savedTailoredForJob.tailoredCvText : undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Application Submitted!', description: 'Your application has been sent successfully.' });
      setShowApplyDialog(false);
      setCoverLetter('');
      setCoverLetterSource('');
      setApplyCvChoice('original');
      setSavedTailoredForJob(null);
      queryClient.invalidateQueries({ queryKey: ['job-public', jobId] });
      queryClient.invalidateQueries({ queryKey: ['my-applications'] });
      queryClient.invalidateQueries({ queryKey: ['browse-jobs'] });
    },
    onError: (error: any) => {
      toast({ title: 'Application Failed', description: error.message || 'Something went wrong', variant: 'destructive' });
    },
  });

  const generateCoverLetterMutation = useMutation({
    mutationFn: () => generateCoverLetter(jobId, coverLetterTone),
    onSuccess: (data) => {
      setCoverLetter(data.coverLetter);
      setCoverLetterSource('generated');
      queryClient.invalidateQueries({ queryKey: ['cover-letter', jobId] });
      const isFallback = data.coverLetter?.startsWith('AI cover letter is not available');
      toast({
        title: isFallback ? 'AI not configured' : 'Cover letter generated',
        description: isFallback ? 'Add ALIBABA_LLM_API_KEY to .env and restart to enable AI. You can write your letter below.' : 'You can edit it below before applying.',
      });
    },
    onError: (err: any) => {
      toast({ title: 'Generation failed', description: err.message || 'Try again or write your cover letter manually.', variant: 'destructive' });
    },
  });

  const myMatch = job?.match;
  const applicationStatus = job?.applicationStatus;

  const getDaysRemaining = (deadline: string | null | undefined) => {
    if (!deadline) return null;
    const diff = new Date(deadline).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Deadline passed';
    if (days === 0) return 'Due today';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      applied: { label: 'Applied', variant: 'default' },
      screening: { label: 'Under Screening', variant: 'secondary' },
      interview: { label: 'Interview Stage', variant: 'secondary' },
      offer: { label: 'Offer Received!', variant: 'default' },
      hired: { label: 'Hired!', variant: 'default' },
      rejected: { label: 'Rejected', variant: 'destructive' },
      withdrawn: { label: 'Withdrawn', variant: 'outline' },
    };
    const b = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={b.variant} className="text-sm">{b.label}</Badge>;
  };

  if (jobLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Job not found</p>
        <Link href="/candidate/jobs">
          <Button variant="outline" className="mt-4">Back to Jobs</Button>
        </Link>
      </div>
    );
  }

  const isClosed = !!(job.deadline && new Date(job.deadline) < new Date());
  const canApply = user?.role === 'candidate' && !applicationStatus && !isClosed;
  const hasApplied = !!applicationStatus && applicationStatus !== 'withdrawn';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/candidate/jobs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{job.title}</h1>
            {isClosed && (
              <Badge variant="destructive" className="font-medium">
                Closed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {job.companyProfile?.logoUrl ? (
              <img src={job.companyProfile.logoUrl} alt="" className="w-5 h-5 rounded-sm object-cover" />
            ) : (
              <Building2 className="w-4 h-4 text-muted-foreground" />
            )}
            <p className="text-muted-foreground">
              {job.companyProfile?.companyName || job.company || 'Company'} · {job.department}
            </p>
          </div>
        </div>
        {hasApplied && getStatusBadge(applicationStatus!)}
      </div>

      {/* Match Score Card */}
      {myMatch && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4">
                <ScoreBadge score={myMatch.score} size="lg" showLabel />
              </div>
              <div className="flex-1">
                <BreakdownBar breakdown={myMatch.breakdown} />
              </div>
            </div>
            {myMatch.explanation && (
              <p className="text-sm text-muted-foreground mt-4">{myMatch.explanation}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Application Status Banner */}
      {hasApplied && (
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">You've applied to this position</p>
              <p className="text-xs text-muted-foreground">
                Status: {applicationStatus} · Track your application in the Applications tab
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Applications closed banner */}
      {isClosed && !hasApplied && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Applications closed</p>
              <p className="text-xs text-muted-foreground">
                The deadline for this position has passed. You can still view the job details but cannot submit an application.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Job Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>
                {job.city ? `${job.city}, ` : ''}
                {getCountryFromCode(job.country)}
              </span>
              <Badge variant="outline" className="ml-1 capitalize">{job.locationType}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>Posted {formatDate(job.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>{job.minYearsExperience}+ years experience</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <span className="capitalize">{job.seniorityLevel} level</span>
            </div>
          </div>
          {job.deadline && (
            <div className={`flex items-center gap-2 text-sm ${isClosed ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
              <Clock className="w-4 h-4" />
              <span>Deadline: {formatDate(job.deadline)} ({getDaysRemaining(job.deadline)})</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Info */}
      {job.companyProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">About the Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              {job.companyProfile.logoUrl ? (
                <img src={job.companyProfile.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium">{job.companyProfile.companyName}</p>
                {job.companyProfile.industry && (
                  <p className="text-sm text-muted-foreground">{job.companyProfile.industry}</p>
                )}
              </div>
            </div>
            {job.companyProfile.description && (
              <p className="text-sm text-muted-foreground">{job.companyProfile.description}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {job.companyProfile.companySize && (
                <Badge variant="outline">{job.companyProfile.companySize} employees</Badge>
              )}
              {job.companyProfile.website && (
                <a
                  href={job.companyProfile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Website
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Job Description</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            What you&apos;ll do and what we&apos;re looking for
          </p>
        </CardHeader>
        <CardContent className="pt-2 pb-6">
          <JobDescriptionContent description={job.description} />
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Requirements</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Must-have and nice-to-have skills
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-base font-medium mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              Must-Have Skills
            </h4>
            <div className="flex flex-wrap gap-2">
              {job.mustHaveSkills?.map((skill) => (
                <Badge key={skill} variant="default">{skill}</Badge>
              ))}
            </div>
          </div>
          {job.niceToHaveSkills && job.niceToHaveSkills.length > 0 && (
            <div>
              <h4 className="text-base font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Nice-to-Have Skills
              </h4>
              <div className="flex flex-wrap gap-2">
                {job.niceToHaveSkills.map((skill) => (
                  <Badge key={skill} variant="secondary">{skill}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gaps */}
      {myMatch?.gaps && myMatch.gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Areas to Improve</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myMatch.gaps.map((gap: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20">
                  <Badge variant="outline" className="capitalize shrink-0">{gap.severity}</Badge>
                  <span className="text-sm">{gap.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {canApply && (
          <Button
            size="lg"
            onClick={() => setShowApplyDialog(true)}
            className="flex-1 gap-2"
          >
            <Send className="w-4 h-4" />
            Apply Now
          </Button>
        )}
        {applicationStatus === 'withdrawn' && !isClosed && (
          <Button
            size="lg"
            onClick={() => setShowApplyDialog(true)}
            className="flex-1 gap-2"
          >
            <Send className="w-4 h-4" />
            Re-Apply
          </Button>
        )}
        <Link href={`/candidate/cv-review?jobId=${jobId}`}>
          <Button size="lg" variant="outline" className="gap-2">
            <FileEdit className="w-4 h-4" />
            Tailor My Resume
          </Button>
        </Link>
        <Link href="/candidate/jobs">
          <Button size="lg" variant="outline">Back to Jobs</Button>
        </Link>
      </div>

      {/* Apply Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={(open) => {
        setShowApplyDialog(open);
        if (!open) {
          setCoverLetter('');
          setCoverLetterSource('');
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply to {job.title}</DialogTitle>
            <DialogDescription>
              at {job.companyProfile?.companyName || job.company || 'Company'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">CV to attach</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="applyCvChoice"
                    checked={applyCvChoice === 'original'}
                    onChange={() => setApplyCvChoice('original')}
                    className="rounded-full"
                  />
                  <span className="text-sm">My original CV</span>
                </label>
                {savedTailoredForJob ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="applyCvChoice"
                      checked={applyCvChoice === 'tailored'}
                      onChange={() => setApplyCvChoice('tailored')}
                      className="rounded-full"
                    />
                    <span className="text-sm">Tailored CV for this job (saved)</span>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Use &quot;Tailor My Resume&quot; first to generate and save a tailored CV, then you can select it here.
                  </p>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">
                  Cover Letter <span className="text-muted-foreground">(optional)</span>
                </label>
              </div>
              {/* Generate with AI: tone + button — no need to leave the dialog */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Select value={coverLetterTone} onValueChange={(v) => setCoverLetterTone(v as CoverLetterTone)}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                    <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 h-9"
                  onClick={() => generateCoverLetterMutation.mutate()}
                  disabled={generateCoverLetterMutation.isPending}
                >
                  {generateCoverLetterMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate with AI
                    </>
                  )}
                </Button>
              </div>
              {savedCLLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking for saved cover letter…
                </div>
              ) : savedCoverLetter?.content && coverLetterSource === 'saved' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Saved cover letter loaded (v{savedCoverLetter.version})</span>
                  </div>
                  <Textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Why are you interested in this role? What makes you a great fit?"
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    You can edit above or generate a new one with AI. Changes won&apos;t update the saved version.
                  </p>
                </div>
              ) : (
                <Textarea
                  value={coverLetter}
                  onChange={(e) => {
                    setCoverLetter(e.target.value);
                    setCoverLetterSource('manual');
                  }}
                  placeholder="Why are you interested in this role? What makes you a great fit? Or use Generate with AI above."
                  rows={6}
                />
              )}
            </div>
            {myMatch && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <ScoreBadge score={myMatch.score} size="sm" />
                <span className="text-sm text-muted-foreground">
                  Your AI match score will be shared with the recruiter
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={
                applyMutation.isPending ||
                (applyCvChoice === 'tailored' && !savedTailoredForJob?.tailoredCvText)
              }
              className="gap-2"
            >
              {applyMutation.isPending ? 'Submitting...' : 'Submit Application'}
              <Send className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
