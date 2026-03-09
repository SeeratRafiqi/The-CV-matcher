import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getMyApplications, withdrawApplication } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ScoreBadge';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/helpers';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FileText,
  Building2,
  MapPin,
  Calendar,
  ArrowRight,
  XCircle,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertTriangle,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import type { Application, ApplicationStatus } from '@/types';

const statusOptions = [
  { value: 'all', label: 'All Applications' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const statusConfig: Record<string, {
  label: string;
  icon: React.ReactNode;
  color: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}> = {
  applied: { label: 'Applied', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-blue-600', variant: 'default' },
  screening: { label: 'Screening', icon: <Clock className="w-4 h-4" />, color: 'text-amber-600', variant: 'secondary' },
  interview: { label: 'Interview', icon: <Briefcase className="w-4 h-4" />, color: 'text-purple-600', variant: 'secondary' },
  offer: { label: 'Offer', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-600', variant: 'default' },
  hired: { label: 'Hired!', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600', variant: 'default' },
  rejected: { label: 'Rejected', icon: <XCircle className="w-4 h-4" />, color: 'text-red-600', variant: 'destructive' },
  withdrawn: { label: 'Withdrawn', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-gray-500', variant: 'outline' },
};

export default function CandidateApplications() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications, isLoading } = useQuery({
    queryKey: ['my-applications', statusFilter],
    queryFn: () => getMyApplications(statusFilter !== 'all' ? statusFilter : undefined),
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => withdrawApplication(id),
    onSuccess: () => {
      toast({ title: 'Application Withdrawn', description: 'Your application has been withdrawn.' });
      setWithdrawTarget(null);
      queryClient.invalidateQueries({ queryKey: ['my-applications'] });
      queryClient.invalidateQueries({ queryKey: ['browse-jobs'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const getStatusInfo = (status: string) =>
    statusConfig[status] || { label: status, icon: null, color: '', variant: 'outline' as const };

  // Normalise — the API should return Application[], but guard against wrapped responses
  const appList: Application[] = Array.isArray(applications) ? applications : [];

  // Stats
  const stats = {
    total: appList.length,
    active: appList.filter((a) => ['applied', 'screening', 'interview'].includes(a.status)).length,
    offers: appList.filter((a) => ['offer', 'hired'].includes(a.status)).length,
    rejected: appList.filter((a) => a.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Applications</h1>
        <p className="text-muted-foreground">Track the status of your job applications</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.offers}</p>
            <p className="text-xs text-muted-foreground">Offers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Application List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : appList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {statusFilter !== 'all'
                ? `No ${statusFilter} applications`
                : 'No applications yet. Browse jobs to get started!'}
            </p>
            <Link href="/candidate/jobs">
              <Button className="mt-4 gap-2">
                Browse Jobs
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appList.map((app) => {
            const statusInfo = getStatusInfo(app.status);
            return (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Company Logo */}
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {app.job?.companyProfile?.logoUrl ? (
                        <img
                          src={app.job.companyProfile.logoUrl}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Job Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/candidate/jobs/${app.jobId}`}>
                            <h3 className="font-medium hover:text-primary cursor-pointer">
                              {app.job?.title || 'Unknown Job'}
                            </h3>
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {app.job?.companyProfile?.companyName || app.job?.company || 'Company'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {app.matchScore != null && <ScoreBadge score={app.matchScore} size="sm" />}
                          <Badge variant={statusInfo.variant}>
                            <span className="flex items-center gap-1.5">
                              {statusInfo.icon}
                              {statusInfo.label}
                            </span>
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {app.job?.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {app.job.city}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Applied {formatDate(app.appliedAt)}
                        </span>
                        {app.job?.locationType && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {app.job.locationType}
                          </Badge>
                        )}
                        {app.job?.seniorityLevel && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {app.job.seniorityLevel}
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3">
                        <Link href={`/candidate/jobs/${app.jobId}`}>
                          <Button variant="outline" size="sm" className="gap-1">
                            View Job
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                        {app.status === 'applied' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive gap-1"
                            onClick={() => setWithdrawTarget(app)}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Withdraw
                          </Button>
                        )}
                      </div>

                      {/* Cover letter submitted for this application */}
                      <Collapsible className="mt-3">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {app.coverLetter?.trim()
                              ? 'View cover letter submitted for this application'
                              : 'Cover letter for this application'}
                            <ChevronDown className="w-3.5 h-3.5 ml-0.5 data-[state=open]:rotate-180 transition-transform" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">
                            {app.coverLetter?.trim() ? (
                              <p className="whitespace-pre-wrap text-foreground/90">{app.coverLetter}</p>
                            ) : (
                              <p className="text-muted-foreground italic">No cover letter was submitted for this application.</p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* CV submitted for this application (original vs tailored) */}
                      <Collapsible className="mt-2">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
                            <FileText className="w-3.5 h-3.5" />
                            {app.cvType === 'tailored'
                              ? 'View CV submitted (tailored for this job)'
                              : 'View CV submitted (original)'}
                            <ChevronDown className="w-3.5 h-3.5 ml-0.5 data-[state=open]:rotate-180 transition-transform" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">
                            <p className="text-muted-foreground mb-2">
                              You submitted your <strong>{app.cvType === 'tailored' ? 'tailored' : 'original'}</strong> CV for this application.
                            </p>
                            {app.submittedCvText?.trim() ? (
                              <pre className="whitespace-pre-wrap text-foreground/90 font-sans text-xs max-h-64 overflow-y-auto rounded border p-2 bg-background/50">
                                {app.submittedCvText}
                              </pre>
                            ) : (
                              <p className="text-muted-foreground italic">Submitted CV text is not stored for this application.</p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Withdraw Confirmation */}
      <Dialog open={!!withdrawTarget} onOpenChange={() => setWithdrawTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Application?</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw your application for{' '}
              <strong>{withdrawTarget?.job?.title}</strong>? You can re-apply later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => withdrawTarget && withdrawMutation.mutate(withdrawTarget.id)}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? 'Withdrawing...' : 'Withdraw Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
