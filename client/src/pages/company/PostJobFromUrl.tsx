import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { createCompanyJobFromUrl } from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function PostJobFromUrl() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [publish, setPublish] = useState(true);

  const extractMutation = useMutation({
    mutationFn: (jobUrl: string) => createCompanyJobFromUrl(jobUrl, publish ? 'published' : 'draft'),
    onSuccess: (job) => {
      toast({
        title: 'Job created successfully',
        description: `Job "${job.title}" has been created from the URL.`,
      });
      setLocation(`/company/jobs/${job.id}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create job',
        description: error.message || 'An error occurred while processing the job URL.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast({
        title: 'URL required',
        description: 'Please enter a valid job posting URL.',
        variant: 'destructive',
      });
      return;
    }

    try {
      new URL(url);
    } catch {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid URL (e.g., https://example.com/job-posting)',
        variant: 'destructive',
      });
      return;
    }

    extractMutation.mutate(url);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/company/jobs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create Job from URL</h1>
          <p className="text-muted-foreground">
            Paste a job posting link and let AI extract everything automatically
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Job Posting URL</CardTitle>
          <CardDescription>
            Enter the URL of a job posting page. Our AI will extract the job title, description,
            requirements, location, and skills automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Job Posting URL</Label>
              <div className="flex gap-2">
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/jobs/software-engineer"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={extractMutation.isPending}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={extractMutation.isPending || !url.trim()}
                >
                  {extractMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Extract & Create
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Supports LinkedIn, Indeed, Glassdoor, company career pages, and most other job boards.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
              <div>
                <Label htmlFor="publish" className="text-base font-medium">
                  Publish Immediately
                </Label>
                <p className="text-sm text-muted-foreground">
                  Publishing will generate the Job Matrix and start matching candidates
                </p>
              </div>
              <Switch
                id="publish"
                checked={publish}
                onCheckedChange={setPublish}
                disabled={extractMutation.isPending}
              />
            </div>

            {extractMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {extractMutation.error instanceof Error
                    ? extractMutation.error.message
                    : 'Failed to extract job information from the URL. Please check the URL and try again.'}
                </AlertDescription>
              </Alert>
            )}

            {extractMutation.isPending && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p>Fetching job posting content…</p>
                    <p className="text-sm text-muted-foreground">
                      Extracting job information using AI. This may take a few moments.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              1
            </div>
            <div>
              <p className="font-medium text-foreground">Paste the URL</p>
              <p>Enter the link to any job posting from LinkedIn, Indeed, or any career page</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              2
            </div>
            <div>
              <p className="font-medium text-foreground">AI Extraction</p>
              <p>Our AI reads the page and extracts the title, description, skills, location, and requirements</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              3
            </div>
            <div>
              <p className="font-medium text-foreground">Job Created</p>
              <p>
                The job is added to your listings. If published, the Job Matrix is automatically
                generated and candidates start getting matched right away.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/company/jobs">
          <Button variant="outline" type="button">
            Cancel
          </Button>
        </Link>
        <Link href="/company/jobs/new">
          <Button variant="outline" type="button">
            Create Manually Instead
          </Button>
        </Link>
      </div>
    </div>
  );
}
