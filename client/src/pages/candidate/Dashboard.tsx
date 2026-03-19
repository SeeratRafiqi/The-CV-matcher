import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuthStore } from '@/store/auth';
import {
  getCandidateProfile,
  uploadCandidateCv,
  getRecommendedJobs,
  rerunCandidateMatching,
} from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { WavyGradientBackground } from '@/components/WavyGradientBackground';
import { TiltCard } from '@/components/TiltCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ScoreBadge';
import { StatusChip } from '@/components/StatusChip';
import { FileDropzone } from '@/components/FileDropzone';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/helpers';
import {
  Upload,
  Briefcase,
  Sparkles,
  RefreshCw,
  ArrowRight,
  FileText,
  User,
  CheckCircle,
} from 'lucide-react';
import type { UploadProgress } from '@/types';

export default function CandidateDashboard() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<UploadProgress[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: getCandidateProfile,
  });

  // Candidate ID from auth store or from the loaded profile
  const candidateId = user?.candidateId || profile?.id;

  const { data: recommendedJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['candidate-recommended-jobs', candidateId],
    queryFn: () => (candidateId ? getRecommendedJobs(candidateId) : Promise.resolve([])),
    enabled: !!candidateId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadCandidateCv(file),
    onSuccess: () => {
      toast({ title: 'CV uploaded successfully', description: 'AI is processing your CV. Skills and matches will appear shortly.' });
      setFiles([]);
      setShowUpload(false);
      // Poll profile to pick up matrix once processing completes
      const pollInterval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['candidate-profile'] });
        queryClient.invalidateQueries({ queryKey: ['candidate-recommended-jobs'] });
      }, 5000);
      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120_000);
    },
    onError: (error: any) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: () => rerunCandidateMatching(),
    onSuccess: () => {
      toast({ title: 'Re-processing started', description: 'Skills and matches will update shortly.' });
      // Poll for updates
      const pollInterval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['candidate-profile'] });
        queryClient.invalidateQueries({ queryKey: ['candidate-recommended-jobs'] });
      }, 5000);
      setTimeout(() => clearInterval(pollInterval), 120_000);
    },
  });

  const handleFilesAccepted = (acceptedFiles: File[]) => {
    const newFiles: UploadProgress[] = acceptedFiles.slice(0, 1).map((file) => ({
      filename: file.name,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles(newFiles);
  };

  const handleUpload = () => {
    if (files.length > 0) {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (input?.files?.length) {
        uploadMutation.mutate(input.files[0]);
      }
    }
  };

  const skillList = Array.isArray(profile?.matrix?.skills)
    ? profile.matrix.skills.map((s: any) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
    : [];

  // Profile completeness check
  const completeness = {
    photo: !!profile?.photoUrl,
    headline: !!profile?.headline,
    cv: !!profile?.cvFile,
    skills: skillList.length > 0,
  };
  const completenessPercent = Object.values(completeness).filter(Boolean).length * 25;

  return (
    <div className="relative z-10 space-y-8">
      <WavyGradientBackground />
      {/* Hero section with 3D tilt */}
      <TiltCard maxTilt={6} className="w-full">
        <Card className="overflow-hidden border-none bg-gradient-to-r from-muted/80 via-background to-background shadow-lg">
          <CardContent className="p-6 sm:p-8">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center">
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                  Candidate dashboard
                </p>
                <h1 className="text-[28px] sm:text-[32px] font-semibold leading-tight">
                  Welcome back, {user?.name?.split(' ')[0]}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
                  Upload your CV, let AI understand your profile, and get matched to roles that actually fit you.
                  This page gives you a quick snapshot of your profile strength and top opportunities.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Browse matched jobs
                  </Button>
                  <Link href="/candidate/cv-review">
                    <Button variant="outline" className="gap-2">
                      <FileText className="w-4 h-4" />
                      AI CV review
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Profile completeness pill card */}
              <div className="rounded-3xl bg-card/80 border border-border/70 px-5 py-4 space-y-4 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Profile completeness</p>
                    <p className="text-2xl font-semibold mt-1">{completenessPercent}%</p>
                  </div>
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
                    <User className="w-6 h-6" />
                  </div>
                </div>
                <div className="w-full bg-muted/60 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${completenessPercent}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-3 mt-1">
                  {[
                    { label: 'Photo', done: completeness.photo },
                    { label: 'Headline', done: completeness.headline },
                    { label: 'CV uploaded', done: completeness.cv },
                    { label: 'Skills extracted', done: completeness.skills },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border ${
                        item.done
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-border/80 text-muted-foreground'
                      }`}
                    >
                      <CheckCircle className={`w-3.5 h-3.5 ${item.done ? '' : 'opacity-40'}`} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TiltCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload CV Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5" />
              My CV
            </CardTitle>
            <CardDescription>Upload or update your CV</CardDescription>
          </CardHeader>
          <CardContent>
            {profileLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : profile?.cvFile ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                  <FileText className="w-8 h-8 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{profile.cvFile.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {formatDate(profile.cvFile.uploadedAt)}
                    </p>
                  </div>
                  <StatusChip status={profile.cvFile.status} />
                </div>
                {!showUpload ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowUpload(true)}
                    className="w-full gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Update CV
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <FileDropzone
                      onFilesAccepted={handleFilesAccepted}
                      files={files}
                      onRemoveFile={() => setFiles([])}
                      maxFiles={1}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowUpload(false);
                          setFiles([]);
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleUpload}
                        disabled={files.length === 0 || uploadMutation.isPending}
                        className="flex-1"
                      >
                        {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <FileDropzone
                  onFilesAccepted={handleFilesAccepted}
                  files={files}
                  onRemoveFile={() => setFiles([])}
                  maxFiles={1}
                />
                <Button
                  onClick={handleUpload}
                  disabled={files.length === 0 || uploadMutation.isPending}
                  className="w-full gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload CV'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Matrix Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                My Matrix
              </CardTitle>
              <CardDescription>AI-extracted profile summary</CardDescription>
            </div>
            {profile?.cvFile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => rerunMutation.mutate()}
                disabled={rerunMutation.isPending}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${rerunMutation.isPending ? 'animate-spin' : ''}`} />
                Re-run
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {profileLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : profile?.matrix ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-md bg-muted/50 text-center">
                    <p className="text-2xl font-bold">{profile.matrix.totalYearsExperience ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Years Exp.</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50 text-center">
                    <p className="text-2xl font-bold">{skillList.length}</p>
                    <p className="text-xs text-muted-foreground">Skills</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {skillList.slice(0, 6).map((name, i) => (
                    <Badge key={name || i} variant="secondary" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                  {skillList.length > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{skillList.length - 6} more
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Matrix generated by AI</span>
                  <Badge variant="outline" className="text-[10px]">
                    {profile.matrix.confidence ?? 0}% confidence
                  </Badge>
                </div>
              </div>
            ) : profile?.cvFile && profile.cvFile.status !== 'matrix_ready' ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <RefreshCw className="w-10 h-10 text-primary mb-3 animate-spin" />
                <p className="text-muted-foreground font-medium">AI is processing your CV...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Extracting skills, experience, and generating your profile matrix.
                  This usually takes 30-60 seconds.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sparkles className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Upload your CV to generate your matrix</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recommended Jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Recommended Jobs
            </CardTitle>
            <CardDescription>Jobs that match your profile</CardDescription>
          </div>
          <Link href="/candidate/jobs">
            <Button variant="ghost" size="sm" className="gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !recommendedJobs || recommendedJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Briefcase className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No job matches yet. Upload your CV to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recommendedJobs.slice(0, 5).map((match) => (
                <Link key={match.id} href={`/candidate/jobs/${match.jobId}`}>
                  <div className="flex items-center gap-4 p-3 rounded-md border hover-elevate cursor-pointer">
                    <ScoreBadge score={match.score} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{match.job?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {match.job?.department} · {match.job?.city}, {match.job?.country}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize shrink-0">
                      {match.job?.locationType}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
