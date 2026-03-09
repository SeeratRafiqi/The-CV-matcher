import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/auth';
import {
  getCandidateProfile,
  updateCandidateProfile,
  uploadCandidatePhoto,
  deleteCandidatePhoto,
  rerunMatching,
} from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { User, RefreshCw, Save, Camera, Trash2, Link as LinkIcon, Globe, Github } from 'lucide-react';

const profileSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  linkedinUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  githubUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  portfolioUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const countryOptions = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'IN', label: 'India' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AU', label: 'Australia' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'SE', label: 'Sweden' },
  { value: 'CA', label: 'Canada' },
  { value: 'PK', label: 'Pakistan' },
];

export default function CandidateProfile() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showRemovePhotoAlert, setShowRemovePhotoAlert] = useState(false);

  const candidateId = user?.candidateId;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: getCandidateProfile,
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phone: '',
      country: '',
      countryCode: '',
      headline: '',
      bio: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
    },
    values: profile
      ? {
          name: profile.name || '',
          phone: profile.phone || '',
          country: profile.country || '',
          countryCode: profile.countryCode || '',
          headline: profile.headline || '',
          bio: profile.bio || '',
          linkedinUrl: profile.linkedinUrl || '',
          githubUrl: profile.githubUrl || '',
          portfolioUrl: profile.portfolioUrl || '',
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProfileFormData) => updateCandidateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-profile'] });
      toast({ title: 'Profile updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update profile', description: error.message, variant: 'destructive' });
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadCandidatePhoto(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-profile'] });
      toast({ title: 'Photo updated successfully' });
      setPhotoPreview(null);
    },
    onError: (error: any) => {
      toast({ title: 'Photo upload failed', description: error.message, variant: 'destructive' });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: () => deleteCandidatePhoto(),
    onSuccess: () => {
      setPhotoPreview(null);
      setShowRemovePhotoAlert(false);
      queryClient.setQueryData(['candidate-profile'], (old: any) =>
        old ? { ...old, photoUrl: null } : old
      );
      queryClient.invalidateQueries({ queryKey: ['candidate-profile'] });
      refreshUser();
      toast({ title: 'Profile photo removed' });
    },
    onError: (error: any) => {
      setShowRemovePhotoAlert(false);
      toast({ title: 'Failed to remove photo', description: error.message, variant: 'destructive' });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: () => (candidateId ? rerunMatching(candidateId) : Promise.reject('No candidate ID')),
    onSuccess: () => {
      toast({ title: 'Matching re-run complete', description: 'Your job recommendations have been updated.' });
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      photoMutation.mutate(file);
    }
  };

  const handleConfirmRemovePhoto = () => {
    deletePhotoMutation.mutate();
  };

  const onSubmit = (data: ProfileFormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-2xl mx-auto px-4 py-6">
        <Skeleton className="h-10 w-56 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const displayPhoto = photoPreview || profile?.photoUrl;

  return (
    <div className="space-y-8 max-w-2xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="space-y-1 pb-6 border-b border-border/60">
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-[15px]">
          Manage your personal information and how recruiters see you
        </p>
      </div>

      {/* Profile photo card */}
      <Card className="overflow-hidden border border-border/50 shadow-sm rounded-xl">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="relative group shrink-0">
              <Avatar className="w-24 h-24 rounded-xl border-2 border-border/50 shadow-md">
                {displayPhoto && <AvatarImage src={displayPhoto} className="rounded-xl object-cover" />}
                <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-2xl font-semibold">
                  {profile?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <Camera className="w-8 h-8 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="font-semibold text-lg">{profile?.name}</h3>
                <p className="text-sm text-muted-foreground">{profile?.headline || 'No headline set'}</p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">{profile?.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoMutation.isPending}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {photoMutation.isPending ? 'Uploading...' : 'Change photo'}
                </Button>
                {displayPhoto && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                    disabled={deletePhotoMutation.isPending}
                    onClick={() => setShowRemovePhotoAlert(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deletePhotoMutation.isPending ? 'Removing...' : 'Remove photo'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRemovePhotoAlert} onOpenChange={setShowRemovePhotoAlert}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your profile picture. You can upload a new one anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setShowRemovePhotoAlert(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-lg"
              disabled={deletePhotoMutation.isPending}
              onClick={handleConfirmRemovePhoto}
            >
              {deletePhotoMutation.isPending ? 'Removing...' : 'Remove photo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Personal info card */}
      <Card className="overflow-hidden border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
              <User className="w-4 h-4" />
            </span>
            Personal Information
          </CardTitle>
          <CardDescription className="text-[15px]">
            Update your profile details. Changes may affect your job matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[15px]">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" className="rounded-lg h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="headline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[15px]">Professional Headline</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Senior Software Engineer" className="rounded-lg h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[15px]">Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us about yourself..."
                        className="min-h-[100px] rounded-lg resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[15px]">Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+1 555 123 4567" className="rounded-lg h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[15px]">Country</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-lg h-10">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countryOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-5 pt-2">
                <h4 className="text-sm font-medium flex items-center gap-2 text-foreground">
                  <LinkIcon className="w-4 h-4 text-muted-foreground" />
                  Social Links
                </h4>
                <FormField
                  control={form.control}
                  name="linkedinUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[15px]">LinkedIn</FormLabel>
                      <FormControl>
                        <Input placeholder="https://linkedin.com/in/yourprofile" className="rounded-lg h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="githubUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[15px] flex items-center gap-1.5">
                        <Github className="w-3.5 h-3.5" />
                        GitHub
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="https://github.com/yourusername" className="rounded-lg h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="portfolioUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[15px] flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        Portfolio
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="https://yourportfolio.com" className="rounded-lg h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="rounded-lg h-10 px-6 gap-2 font-medium"
                >
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Re-run matching card */}
      <Card className="overflow-hidden border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
              <RefreshCw className="w-4 h-4" />
            </span>
            Re-run Matching
          </CardTitle>
          <CardDescription className="text-[15px]">
            Update your job recommendations based on your current profile and CV
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-5">
            If you've made significant changes to your profile or uploaded a new CV, re-run the
            matching algorithm to get updated job recommendations.
          </p>
          <Button
            variant="outline"
            size="default"
            className="rounded-lg h-10 px-6 gap-2 font-medium"
            onClick={() => rerunMutation.mutate()}
            disabled={rerunMutation.isPending || !candidateId}
          >
            <RefreshCw className={`w-4 h-4 ${rerunMutation.isPending ? 'animate-spin' : ''}`} />
            {rerunMutation.isPending ? 'Processing...' : 'Re-run Matching'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
