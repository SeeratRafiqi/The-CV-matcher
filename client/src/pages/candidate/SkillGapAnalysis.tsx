import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { analyzeSkillGaps } from '@/api';
import type { SkillGapAnalysisResult } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Target,
  Sparkles,
  Loader2,
  TrendingUp,
  Clock,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';

export default function SkillGapAnalysis() {
  const { toast } = useToast();
  const [targetRole, setTargetRole] = useState('');
  const [result, setResult] = useState<SkillGapAnalysisResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => analyzeSkillGaps({ targetRole: targetRole || undefined }),
    onSuccess: (data) => {
      setResult(data);
      toast({ title: 'Skill Gap Analysis Complete' });
    },
    onError: (err: any) => {
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    },
  });

  const importanceColor = (imp: string) => {
    switch (imp) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" />
          Skill Gap Analysis
        </h1>
        <p className="text-muted-foreground mt-1">
          Discover which skills to learn next to maximize your job match scores.
        </p>
      </div>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analyze My Skills</CardTitle>
          <CardDescription>
            Enter a target role to see which skills you're missing and how much impact they'd have.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Target Role</label>
              <Input
                placeholder="e.g. Full-Stack Developer, Data Scientist"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
              {mutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</>
              ) : (
                <><Sparkles className="w-4 h-4" />Analyze</>
              )}
            </Button>
          </div>
          {mutation.isPending && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI is analyzing your skill gaps… 15-30 seconds.
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Summary */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Gaps Grid */}
          <div className="grid gap-3">
            {result.gaps.map((gap, idx) => (
              <Card key={idx}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{gap.skill}</h3>
                        <Badge className={importanceColor(gap.importance)}>
                          {gap.importance}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Current: {gap.currentLevel || 'none'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          Required: {gap.requiredLevel}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {gap.learningTime}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <div className="flex items-center gap-1 text-sm font-medium text-primary">
                        <TrendingUp className="w-4 h-4" />
                        +{gap.impactOnScore}% score
                      </div>
                      <Progress value={gap.impactOnScore} className="w-20 h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Learning Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-primary font-bold mt-0.5">{i + 1}.</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
