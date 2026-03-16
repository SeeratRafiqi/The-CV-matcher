import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { createCompanyJob, generateJobDescription } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, X, Send, Sparkles, Loader2 } from 'lucide-react';
import { Link } from 'wouter';

const locationTypes = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

const seniorityLevels = [
  { value: 'internship', label: 'Internship' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'principal', label: 'Principal' },
];

export default function PostJob() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: '',
    department: '',
    locationType: 'onsite',
    country: '',
    city: '',
    description: '',
    minYearsExperience: 0,
    seniorityLevel: 'mid',
    deadline: '',
  });

  const [mustHaveSkills, setMustHaveSkills] = useState<string[]>([]);
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>([]);
  const [newMustHaveSkill, setNewMustHaveSkill] = useState('');
  const [newNiceToHaveSkill, setNewNiceToHaveSkill] = useState('');

  const createMutation = useMutation({
    mutationFn: (status: string) =>
      createCompanyJob({
        ...form,
        mustHaveSkills,
        niceToHaveSkills,
        deadline: form.deadline || undefined,
        status,
      }),
    onSuccess: (data) => {
      toast({ title: 'Job Created!', description: `"${data.title}" has been created.` });
      queryClient.invalidateQueries({ queryKey: ['company-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['company-stats'] });
      navigate(`/company/jobs/${data.id}`);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const generateDescMutation = useMutation({
    mutationFn: () =>
      generateJobDescription({
        title: form.title || 'Software role',
        skills: [...mustHaveSkills, ...niceToHaveSkills].length > 0 ? [...mustHaveSkills, ...niceToHaveSkills] : undefined,
        seniorityLevel: form.seniorityLevel,
        locationType: form.locationType,
        industry: form.department || undefined,
      }),
    onSuccess: (data) => {
      setForm((prev) => ({
        ...prev,
        description: data.description,
        seniorityLevel: data.suggestedSeniority || prev.seniorityLevel,
        minYearsExperience: data.suggestedMinYears ?? prev.minYearsExperience,
      }));
      setMustHaveSkills(data.mustHaveSkills || []);
      setNiceToHaveSkills(data.niceToHaveSkills || []);
      toast({ title: 'Description generated', description: 'You can edit it below before publishing.' });
    },
    onError: (err: any) => {
      toast({ title: 'Generation failed', description: err?.message, variant: 'destructive' });
    },
  });

  const addSkill = (type: 'must' | 'nice') => {
    if (type === 'must' && newMustHaveSkill.trim()) {
      if (!mustHaveSkills.includes(newMustHaveSkill.trim())) {
        setMustHaveSkills([...mustHaveSkills, newMustHaveSkill.trim()]);
      }
      setNewMustHaveSkill('');
    } else if (type === 'nice' && newNiceToHaveSkill.trim()) {
      if (!niceToHaveSkills.includes(newNiceToHaveSkill.trim())) {
        setNiceToHaveSkills([...niceToHaveSkills, newNiceToHaveSkill.trim()]);
      }
      setNewNiceToHaveSkill('');
    }
  };

  const isValid = form.title && form.description;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/company/jobs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Post a New Job</h1>
          <p className="text-muted-foreground">Fill in the details to create a job posting</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Job Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Senior Frontend Developer"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Department</label>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="e.g. Engineering"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Seniority Level</label>
              <Select
                value={form.seniorityLevel}
                onValueChange={(v) => setForm({ ...form, seniorityLevel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seniorityLevels.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Location Type</label>
              <Select
                value={form.locationType}
                onValueChange={(v) => setForm({ ...form, locationType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locationTypes.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Country</label>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="e.g. US"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">City</label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g. New York"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Min. Years Experience</label>
              <Input
                type="number"
                min={0}
                value={form.minYearsExperience}
                onChange={(e) =>
                  setForm({ ...form, minYearsExperience: parseInt(e.target.value, 10) || 0 })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Application Deadline</label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Description *</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => generateDescMutation.mutate()}
              disabled={generateDescMutation.isPending}
              className="gap-2"
            >
              {generateDescMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Generate with AI
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Fill in job title (and optionally department, skills) above, then use Generate with AI to create a description. You can edit it below.
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the role, responsibilities, what you're looking for... or click Generate with AI above."
            rows={8}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Must-have skills */}
          <div>
            <label className="text-sm font-medium mb-2 block">Must-Have Skills</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newMustHaveSkill}
                onChange={(e) => setNewMustHaveSkill(e.target.value)}
                placeholder="Add a skill"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('must'))}
              />
              <Button variant="outline" size="icon" onClick={() => addSkill('must')}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {mustHaveSkills.map((skill) => (
                <Badge key={skill} className="gap-1 pr-1">
                  {skill}
                  <button
                    onClick={() => setMustHaveSkills(mustHaveSkills.filter((s) => s !== skill))}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Nice-to-have skills */}
          <div>
            <label className="text-sm font-medium mb-2 block">Nice-to-Have Skills</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newNiceToHaveSkill}
                onChange={(e) => setNewNiceToHaveSkill(e.target.value)}
                placeholder="Add a skill"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('nice'))}
              />
              <Button variant="outline" size="icon" onClick={() => addSkill('nice')}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {niceToHaveSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                  {skill}
                  <button
                    onClick={() =>
                      setNiceToHaveSkills(niceToHaveSkills.filter((s) => s !== skill))
                    }
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-8">
        <Button
          onClick={() => createMutation.mutate('published')}
          disabled={!isValid || createMutation.isPending}
          className="gap-2"
        >
          <Send className="w-4 h-4" />
          {createMutation.isPending ? 'Creating...' : 'Publish Job'}
        </Button>
        <Button
          variant="outline"
          onClick={() => createMutation.mutate('draft')}
          disabled={!isValid || createMutation.isPending}
        >
          Save as Draft
        </Button>
        <Link href="/company/jobs">
          <Button variant="ghost">Cancel</Button>
        </Link>
      </div>
    </div>
  );
}
