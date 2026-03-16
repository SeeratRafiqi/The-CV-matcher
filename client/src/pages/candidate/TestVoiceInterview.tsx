import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { createTestVoiceInterviewSession } from '@/api';
import { Mic, Loader2 } from 'lucide-react';

/**
 * Test page: create a voice interview session and go straight to the interview room.
 * No need to create a job, apply, or assign — one click for testing.
 */
export default function TestVoiceInterview() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await createTestVoiceInterviewSession();
      setLocation(data.url);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create test session');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-800/90 backdrop-blur rounded-2xl border border-gray-700 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2">Test Voice Interview</h1>
        <p className="text-gray-400 text-sm mb-6">
          Creates a voice interview session and opens the interview room. No job or application setup needed.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">
            {error}
          </div>
        )}
        <Button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating session…
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              Start test interview
            </>
          )}
        </Button>
        <p className="text-gray-500 text-xs mt-4 text-center">
          You must be logged in as a candidate. At least one published job must exist.
        </p>
      </div>
    </div>
  );
}
