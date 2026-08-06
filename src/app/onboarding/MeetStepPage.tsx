import { Link } from 'react-router';
import { Button } from '@/app/components/ui/button';

/**
 * "Join a real Google Meet" (plan §4.2 step 9). Previews Meet's own camera
 * permission prompt with a mock so first-time users recognize it and know
 * to click "Allow" instead of hesitating mid-call. Not a live screenshot
 * (none was available in this repo) — a faithful CSS reproduction of
 * Chrome's permission chip, labeled as a preview.
 */
export default function MeetStepPage() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-10"
      style={{ background: '#FBF9F6', color: '#1A1512' }}
    >
      <div className="w-full max-w-lg text-center space-y-6">
        <h1
          className="leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300 }}
        >
          You&apos;re ready. Join a real Google Meet.
        </h1>
        <p className="text-sm" style={{ color: '#5A5550' }}>
          When you join, Chrome will ask you to allow camera and microphone access for meet.google.com
          — this is Meet&apos;s own prompt, separate from the one you already granted here.
        </p>

        {/* Mock of Chrome's permission chip, for recognition only. */}
        <div className="flex justify-center">
          <div
            className="rounded-xl shadow-lg p-4 text-left text-sm w-72"
            style={{ background: '#ffffff', border: '1px solid rgba(26,21,18,0.12)' }}
          >
            <p className="font-medium mb-2">meet.google.com wants to</p>
            <p style={{ color: '#5A5550' }}>Use your camera</p>
            <p style={{ color: '#5A5550' }}>Use your microphone</p>
            <div className="flex gap-2 mt-3 justify-end">
              <span className="text-xs px-3 py-1 rounded-full" style={{ color: '#5A5550' }}>
                Block
              </span>
              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: '#1a73e8', color: '#fff' }}>
                Allow
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs" style={{ color: '#5A5550' }}>
          Click Allow. Stash Live will keep working exactly as it did in rehearsal.
        </p>

        <div className="flex justify-center gap-4">
          <Link to="/dashboard">
            <Button variant="outline">Go to dashboard</Button>
          </Link>
          <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer">
            <Button>Open Google Meet</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
