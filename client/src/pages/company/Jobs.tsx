import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getCompanyJobs, deleteCompanyJob } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/StatusChip';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/helpers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Briefcase, Plus, MapPin, Calendar, FileText, Clock, ExternalLink, Trash2 } from 'lucide-react';

const statusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
];

export default function CompanyJobs() {
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: jobsRaw, isLoading } = useQuery({
    queryKey: ['company-jobs', statusFilter],
    queryFn: () => getCompanyJobs(statusFilter !== 'all' ? statusFilter : undefined),
  });

  const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => deleteCompanyJob(jobId),
    onSuccess: () => {
      toast({ title: 'Job deleted' });
      queryClient.invalidateQueries({ queryKey: ['company-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['company-stats'] });
    },
    onError: (error: any) => {
      toast({ title: 'Unable to delete job', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Jobs</h1>
          <p className="text-muted-foreground">Manage your job postings</p>
        </div>
        <div className="flex gap-2">
          <Link href="/company/jobs/from-url">
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Post from URL
            </Button>
          </Link>
          <Link href="/company/jobs/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Post New Job
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="font-medium">No jobs posted yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first job to start finding candidates.
            </p>
            <Link href="/company/jobs/new">
              <Button className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Post a Job
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/company/jobs/${job.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-muted text-muted-foreground">
                      <Briefcase className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{job.title}</h3>
                        <StatusChip status={job.status} />
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.city || job.country}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(job.createdAt)}
                        </span>
                        {job.deadline && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Clock className="w-3.5 h-3.5" />
                            Deadline: {formatDate(job.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteJobMutation.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const confirmed = window.confirm(
                            'Delete this job permanently? This cannot be undone. Jobs with applications cannot be deleted.'
                          );
                          if (confirmed) {
                            deleteJobMutation.mutate(job.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <FileText className="w-3.5 h-3.5" />
                          {job.applicationCount || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">Applications</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{job.seniorityLevel}</Badge>
                        <Badge variant="secondary" className="capitalize">{job.locationType}</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
