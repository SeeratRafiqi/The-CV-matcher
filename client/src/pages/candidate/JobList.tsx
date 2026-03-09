import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { browseJobs, getSavedJobs, saveJob, unsaveJob, applyToJob, generateCoverLetter, getTailoredResumeForJob } from '@/api';
import type { CoverLetterTone } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ScoreBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, getCountryFromCode } from '@/utils/helpers';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Briefcase,
  MapPin,
  Calendar,
  X,
  Search,
  ArrowRight,
  Clock,
  Star,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Bookmark,
  Send,
  Loader2,
  Sparkles,
  FileEdit,
} from 'lucide-react';
import type { Job, LocationType, SeniorityLevel } from '@/types';

const locationTypeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

const seniorityOptions = [
  { value: 'all', label: 'All Levels' },
  { value: 'internship', label: 'Internship' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'principal', label: 'Principal' },
];

const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'relevance', label: 'Best Match' },
  { value: 'deadline', label: 'Deadline Soon' },
];

export default function CandidateJobList() {
  const [search, setSearch] = useState('');
  const [locationType, setLocationType] = useState<string>('all');
  const [seniorityLevel, setSeniorityLevel] = useState<string>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkApplyOpen, setBulkApplyOpen] = useState(false);
  const [bulkCoverLetter, setBulkCoverLetter] = useState('');
  const [bulkCoverLetterTone, setBulkCoverLetterTone] = useState<CoverLetterTone>('formal');
  const [singleApplyJobId, setSingleApplyJobId] = useState<string | null>(null);
  const [singleApplyOpen, setSingleApplyOpen] = useState(false);
  const [singleCoverLetter, setSingleCoverLetter] = useState('');
  const [singleCvChoice, setSingleCvChoice] = useState<'original' | 'tailored'>('original');
  const [savedTailoredForJob, setSavedTailoredForJob] = useState<{ tailoredCvText: string; structuredResume?: unknown } | null>(null);
  const [singleCoverLetterTone, setSingleCoverLetterTone] = useState<CoverLetterTone>('formal');

  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['browse-jobs', search, locationType, seniorityLevel, sortBy, page],
    queryFn: () =>
      browseJobs({
        search: search || undefined,
        locationType: locationType !== 'all' ? locationType : undefined,
        seniorityLevel: seniorityLevel !== 'all' ? seniorityLevel : undefined,
        sortBy,
        page,
        limit: 12,
      }),
  });

  const { data: savedJobsList = [] } = useQuery({
    queryKey: ['saved-jobs'],
    queryFn: getSavedJobs,
  });

  const savedJobIds = useMemo(
    () => new Set((savedJobsList as { job?: { id: string } }[]).map((e) => e.job?.id).filter(Boolean)),
    [savedJobsList]
  );

  const saveMutation = useMutation({
    mutationFn: (jobId: string) => saveJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] });
      toast({ title: 'Job saved', description: 'Added to your saved jobs.' });
    },
    onError: (err: any) => {
      toast({ title: 'Could not save job', description: err?.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: (jobId: string) => unsaveJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] });
      toast({ title: 'Job removed', description: 'Removed from saved jobs.' });
    },
    onError: () => {
      toast({ title: 'Could not remove job', description: 'Please try again.', variant: 'destructive' });
    },
  });

  const handleSaveClick = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (savedJobIds.has(jobId)) {
      unsaveMutation.mutate(jobId);
    } else {
      saveMutation.mutate(jobId);
    }
  };

  const jobs = data?.jobs || [];
  const pagination = data?.pagination;

  const isJobClosed = (job: { deadline?: string | null }) =>
    !!job.deadline && new Date(job.deadline) < new Date();
  const canSelectForApply = (job: { deadline?: string | null; applicationStatus?: string | null }) =>
    !isJobClosed(job) && (!job.applicationStatus || job.applicationStatus === 'withdrawn');
  const applicableJobs = useMemo(() => jobs.filter((j) => canSelectForApply(j)), [jobs]);
  const selectedCount = selectedJobIds.size;

  const selectAll = () => setSelectedJobIds(new Set(applicableJobs.map((j) => j.id)));
  const clearSelection = () => setSelectedJobIds(new Set());

  useEffect(() => {
    if (singleApplyOpen && singleApplyJobId) {
      getTailoredResumeForJob(singleApplyJobId).then((data) => setSavedTailoredForJob(data ?? null));
    } else {
      setSavedTailoredForJob(null);
    }
  }, [singleApplyOpen, singleApplyJobId]);

  const generateBulkCoverLetterMutation = useMutation({
    mutationFn: (jobId: string) => generateCoverLetter(jobId, bulkCoverLetterTone),
    onSuccess: (data) => {
      setBulkCoverLetter(data.coverLetter || '');
      toast({ title: 'Cover letter generated', description: 'Edit if needed, then submit to all selected jobs.' });
    },
    onError: (err: any) => {
      toast({ title: 'Generation failed', description: err?.message || 'Could not generate cover letter.', variant: 'destructive' });
    },
  });
  const singleApplyMutation = useMutation({
    mutationFn: () =>
      applyToJob(singleApplyJobId!, singleCoverLetter || undefined, {
        cvType: singleCvChoice,
        tailoredCvText: singleCvChoice === 'tailored' && savedTailoredForJob?.tailoredCvText ? savedTailoredForJob.tailoredCvText : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browse-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setSingleApplyOpen(false);
      setSingleApplyJobId(null);
      setSingleCoverLetter('');
      setSingleCvChoice('original');
      setSavedTailoredForJob(null);
      toast({ title: 'Application sent', description: 'Your application has been submitted.' });
    },
    onError: (err: any) => {
      toast({ title: 'Apply failed', description: err?.message || 'Could not submit.', variant: 'destructive' });
    },
  });

  const generateSingleCoverLetterMutation = useMutation({
    mutationFn: (jobId: string) => generateCoverLetter(jobId, singleCoverLetterTone),
    onSuccess: (data) => {
      setSingleCoverLetter(data.coverLetter || '');
      toast({ title: 'Cover letter generated', description: 'Edit if needed, then submit.' });
    },
    onError: (err: any) => {
      toast({ title: 'Generation failed', description: err?.message || 'Could not generate.', variant: 'destructive' });
    },
  });

  const bulkApplyMutation = useMutation({
    mutationFn: async () => {
      const results = { ok: 0, fail: 0 };
      for (const id of selectedJobIds) {
        try {
          await applyToJob(id, bulkCoverLetter || undefined);
          results.ok += 1;
        } catch {
          results.fail += 1;
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['browse-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setBulkApplyOpen(false);
      setBulkCoverLetter('');
      setSelectedJobIds(new Set());
      if (results.fail === 0) {
        toast({ title: 'Applications sent', description: `Applied to ${results.ok} job${results.ok !== 1 ? 's' : ''}.` });
      } else {
        toast({ title: 'Partially sent', description: `${results.ok} applied, ${results.fail} failed.`, variant: 'destructive' });
      }
    },
    onError: (err: any) => {
      toast({ title: 'Apply failed', description: err?.message || 'Could not submit applications.', variant: 'destructive' });
    },
  });

  const clearFilters = () => {
    setSearch('');
    setLocationType('all');
    setSeniorityLevel('all');
    setSortBy('newest');
    setPage(1);
  };

  const hasFilters = search || locationType !== 'all' || seniorityLevel !== 'all';

  const getApplicationBadge = (status: string | null | undefined) => {
    if (!status) return null;
    const badges: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      applied: { label: 'Applied', variant: 'default' },
      screening: { label: 'Screening', variant: 'secondary' },
      interview: { label: 'Interview', variant: 'secondary' },
      offer: { label: 'Offer!', variant: 'default' },
      hired: { label: 'Hired', variant: 'default' },
      rejected: { label: 'Rejected', variant: 'destructive' },
      withdrawn: { label: 'Withdrawn', variant: 'outline' },
    };
    const badge = badges[status];
    if (!badge) return null;
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const getDaysRemaining = (deadline: string | null | undefined) => {
    if (!deadline) return null;
    const diff = new Date(deadline).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return null;
    if (days === 0) return 'Due today';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Browse Jobs</h1>
        <p className="text-muted-foreground">
          Discover opportunities that match your skills
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, company, skills..."
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={locationType}
            onValueChange={(v) => {
              setLocationType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {locationTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={seniorityLevel}
            onValueChange={(v) => {
              setSeniorityLevel(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {seniorityOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}
          {pagination && (
            <span className="ml-auto text-sm text-muted-foreground">
              {pagination.total} job{pagination.total !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
        {/* Bulk apply: Select all / Apply to selected */}
        {jobs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={applicableJobs.length === 0}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
              Deselect all
            </Button>
            {selectedCount > 0 && (
              <Button size="sm" onClick={() => setBulkApplyOpen(true)} className="gap-1.5">
                <Send className="w-3.5 h-3.5" />
                Apply to selected ({selectedCount})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Job Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {hasFilters
                ? 'No jobs match the selected filters'
                : 'No published jobs available yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/candidate/jobs/${job.id}`}>
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    {canSelectForApply(job) && (
                      <div
                        className="shrink-0 pt-0.5"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onKeyDown={(e) => { e.stopPropagation(); }}
                      >
                        <Checkbox
                          checked={selectedJobIds.has(job.id)}
                          onCheckedChange={() => {
                            setSelectedJobIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(job.id)) next.delete(job.id);
                              else next.add(job.id);
                              return next;
                            });
                          }}
                          aria-label={selectedJobIds.has(job.id) ? 'Deselect job' : 'Select job for bulk apply'}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {job.isFeatured && (
                          <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                        <CardTitle className="text-base truncate">{job.title}</CardTitle>
                        {isJobClosed(job) && (
                          <Badge variant="destructive" className="shrink-0 text-xs font-medium">
                            Closed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {job.companyProfile?.logoUrl ? (
                          <img
                            src={job.companyProfile.logoUrl}
                            alt=""
                            className="w-4 h-4 rounded-sm object-cover"
                          />
                        ) : (
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <p className="text-sm text-muted-foreground truncate">
                          {job.companyProfile?.companyName || job.company || 'Company'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {job.matchScore != null && <ScoreBadge score={job.matchScore} size="sm" />}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={(e) => handleSaveClick(e, job.id)}
                        disabled={saveMutation.isPending || unsaveMutation.isPending}
                        title={savedJobIds.has(job.id) ? 'Remove from saved' : 'Save job'}
                      >
                        <Bookmark
                          className={`w-4 h-4 ${savedJobIds.has(job.id) ? 'fill-primary text-primary' : ''}`}
                        />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {job.city ? `${job.city}, ` : ''}
                      {getCountryFromCode(job.country)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatDate(job.createdAt)}</span>
                  </div>
                  {job.deadline && getDaysRemaining(job.deadline) && !isJobClosed(job) && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{getDaysRemaining(job.deadline)}</span>
                    </div>
                  )}
                  {isJobClosed(job) && (
                    <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Applications closed</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {isJobClosed(job) && (
                      <Badge variant="destructive" className="text-xs">
                        Closed
                      </Badge>
                    )}
                    <Badge variant="outline" className="capitalize text-xs">
                      {job.locationType}
                    </Badge>
                    <Badge variant="secondary" className="capitalize text-xs">
                      {job.seniorityLevel}
                    </Badge>
                    {job.applicationStatus && getApplicationBadge(job.applicationStatus)}
                    {job.applicationStatus === 'applied' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-auto" />
                    )}
                  </div>

                  {job.mustHaveSkills && job.mustHaveSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {job.mustHaveSkills.slice(0, 3).map((skill, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-normal">
                          {skill}
                        </Badge>
                      ))}
                      {job.mustHaveSkills.length > 3 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{job.mustHaveSkills.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-2" onClick={(e) => e.stopPropagation()}>
                    {canSelectForApply(job) && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5 h-8 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSingleApplyJobId(job.id);
                          setSingleCoverLetter('');
                          setSingleCvChoice('original');
                          setSingleTailoredCvText(null);
                          setSingleApplyOpen(true);
                        }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Apply
                      </Button>
                    )}
                    <Link href={`/candidate/cv-review?jobId=${job.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                        <FileEdit className="w-3.5 h-3.5" />
                        Tailor My Resume
                      </Button>
                    </Link>
                    <Link href={`/candidate/jobs/${job.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                        View
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Bulk Apply Dialog: one cover letter for all selected jobs, with Generate with AI */}
      <Dialog open={bulkApplyOpen} onOpenChange={setBulkApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply to {selectedCount} job{selectedCount !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              Use one cover letter for all selected jobs. Generate with AI (based on the first selected job) or write your own, then submit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={bulkCoverLetterTone} onValueChange={(v) => setBulkCoverLetterTone(v as CoverLetterTone)}>
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
                onClick={() => {
                  const firstId = Array.from(selectedJobIds)[0];
                  if (firstId) generateBulkCoverLetterMutation.mutate(firstId);
                }}
                disabled={generateBulkCoverLetterMutation.isPending || selectedCount === 0}
              >
                {generateBulkCoverLetterMutation.isPending ? (
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
            <Textarea
              value={bulkCoverLetter}
              onChange={(e) => setBulkCoverLetter(e.target.value)}
              placeholder="Your cover letter (optional). Use Generate with AI or write your own, then submit to all selected jobs."
              rows={6}
              className="resize-y"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkApplyMutation.mutate()}
              disabled={bulkApplyMutation.isPending}
              className="gap-2"
            >
              {bulkApplyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit to all {selectedCount} job{selectedCount !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single-job Apply Dialog: CV choice (original / tailored) + cover letter */}
      <Dialog
        open={singleApplyOpen}
        onOpenChange={(open) => {
          setSingleApplyOpen(open);
          if (!open) {
            setSingleApplyJobId(null);
            setSingleCoverLetter('');
            setSingleCvChoice('original');
            setSavedTailoredForJob(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Apply to {singleApplyJobId ? (jobs.find((j) => j.id === singleApplyJobId)?.title ?? 'Job') : 'Job'}
            </DialogTitle>
            <DialogDescription>
              Choose which CV to attach and add an optional cover letter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">CV to attach</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="singleCvChoice"
                    checked={singleCvChoice === 'original'}
                    onChange={() => setSingleCvChoice('original')}
                    className="rounded-full"
                  />
                  <span className="text-sm">My original CV</span>
                </label>
                {savedTailoredForJob ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="singleCvChoice"
                      checked={singleCvChoice === 'tailored'}
                      onChange={() => setSingleCvChoice('tailored')}
                      className="rounded-full"
                    />
                    <span className="text-sm">Tailored CV for this job (saved)</span>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Use &quot;Tailor My Resume&quot; for this job first to generate and save a tailored CV, then you can select it here.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cover letter (optional)</label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={singleCoverLetterTone} onValueChange={(v) => setSingleCoverLetterTone(v as CoverLetterTone)}>
                  <SelectTrigger className="w-[130px] h-9">
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
                  onClick={() => singleApplyJobId && generateSingleCoverLetterMutation.mutate(singleApplyJobId)}
                  disabled={generateSingleCoverLetterMutation.isPending}
                >
                  {generateSingleCoverLetterMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate with AI
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={singleCoverLetter}
                onChange={(e) => setSingleCoverLetter(e.target.value)}
                placeholder="Write or paste your cover letter…"
                rows={5}
                className="resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => singleApplyMutation.mutate()}
              disabled={
                singleApplyMutation.isPending ||
                (singleCvChoice === 'tailored' && !savedTailoredForJob?.tailoredCvText)
              }
              className="gap-2"
            >
              {singleApplyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit application
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
