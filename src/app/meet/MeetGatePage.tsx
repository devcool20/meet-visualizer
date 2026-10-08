/**
 * `/meet` — the door.
 *
 * Google's `/` for Meet: one screen with "New meeting" and a code field. That
 * is the whole interaction, and it is the right one: a stranger who has been
 * sent a Stash Live invite link should be able to be in the call in two taps
 * with no account, no dashboard, and no explanation.
 *
 * The camera preview is here (rather than after the code is entered) because
 * people decide whether to join a meeting based on whether they look presentable
 * in it, and finding that out one screen too late is a papercut that makes the
 * product feel cheap.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Camera, CameraOff, Mic, MicOff, Video } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Wordmark } from '@/app/components/primitives';
import { EASE } from '@/app/motion';
import { useLocalMedia } from './hooks/useLocalMedia';
import { MeetingPreview } from './components/MeetingPreview';
import { MeetFrame, MeetScrim } from './components/MeetFrame';
import { normalizeCode, CODE_PLACEHOLDER } from '@stash/meeting-spec';
import { MeetingUnavailableError, meetingApiBase, reserveRoom } from './lib/meeting-url';

type Busy = 'idle' | 'creating' | 'joining';

export default function MeetGatePage() {
  const navigate = useNavigate();
  const [rawCode, setRawCode] = useState('');
  const [busy, setBusy] = useState<Busy>('idle');
  const [outage, setOutage] = useState<MeetingUnavailableError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const media = useLocalMedia();

  // The code field is the reason people land here. Focus it on mount so a
  // keyboard user can type the code straight away.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const normalized = normalizeCode(rawCode);
  const canJoin = normalized !== null && busy === 'idle';

  const startMeeting = useCallback(async () => {
    setBusy('creating');
    setOutage(null);
    try {
      const reservation = await reserveRoom();
      navigate(`/meet/${reservation.code}?host=1`);
    } catch (err) {
      setBusy('idle');
      setOutage(toOutage(err));
    }
  }, [navigate]);

  const joinMeeting = useCallback(() => {
    if (!normalized) return;
    setBusy('joining');
    setOutage(null);
    navigate(`/meet/${normalized}`);
  }, [normalized, navigate]);

  return (
    <MeetFrame>
      <MeetScrim />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between px-5 py-4 sm:px-7">
          <Link to="/" aria-label="Stash Live home" className="rounded-full transition-opacity hover:opacity-80">
            <Wordmark size="sm" className="text-foreground" />
          </Link>
          <Link
            to="/"
            className="rounded-full px-3 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to site
          </Link>
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 px-5 pb-10 lg:flex-row lg:gap-16 lg:px-10">
          {/* Left: the value proposition + preview */}
          <motion.div
            className="flex w-full max-w-xl flex-col gap-7"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="flex flex-col gap-3">
              <span className="eyebrow">Stash Live Meetings</span>
              <h1 className="font-display text-[clamp(2rem,4.4vw,3.1rem)] leading-[1.05] tracking-tight">
                The meeting where your data
                <br />
                <span className="text-brand">shows up with you.</span>
              </h1>
              <p className="max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
                Every Stash Live presenter gets a built-in meeting room. Speak, and a grounded data card is
                composited straight into the video you are sending — your face stays full size, and everyone
                sees the same numbers at the same moment.
              </p>
            </div>

            <MeetingPreview
              stream={media.stream}
              cameraOn={media.camOn}
              micOn={media.micOn}
              level={media.status === 'ready' || media.status === 'partial' ? undefined : 0}
              name="You"
              muted={!media.micOn}
              compact
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => media.setCamOn(!media.camOn)}
                className="rounded-full"
              >
                {media.camOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
                {media.camOn ? 'Camera on' : 'Camera off'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => media.setMicOn(!media.micOn)}
                className="rounded-full"
              >
                {media.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                {media.micOn ? 'Mic on' : 'Mic off'}
              </Button>
            </div>

            {media.message ? (
              <p className="rounded-panel border border-border bg-card/60 px-4 py-3 text-[0.8125rem] text-muted-foreground">
                {media.message}
              </p>
            ) : null}
          </motion.div>

          {/* Right: the two doors in */}
          <motion.div
            className="glass w-full max-w-sm rounded-panel p-6"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
          >
            <Button
              type="button"
              size="lg"
              onClick={() => void startMeeting()}
              disabled={busy !== 'idle'}
              className="h-12 w-full rounded-full text-[0.9375rem]"
            >
              <Video className="size-4.5" />
              {busy === 'creating' ? 'Setting up…' : 'New meeting'}
            </Button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">or join</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canJoin) joinMeeting();
              }}
              className="flex flex-col gap-2"
            >
              <label htmlFor="meet-code" className="sr-only">
                Meeting code
              </label>
              <input
                id="meet-code"
                ref={inputRef}
                value={rawCode}
                onChange={(e) => {
                  setRawCode(e.target.value.toLowerCase());
                  setOutage(null);
                }}
                placeholder={CODE_PLACEHOLDER}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                aria-describedby="meet-code-help"
                className="telemetry h-12 w-full rounded-full border border-border bg-input-background px-5 text-center text-[1.0625rem] uppercase tracking-[0.18em] placeholder:tracking-[0.12em] placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              <p id="meet-code-help" className="text-center text-[0.75rem] text-muted-foreground">
                {rawCode.length > 0 && !normalized
                  ? 'Codes are three groups of letters, like abc-efgj-pqrt.'
                  : 'Enter the code your host shared.'}
              </p>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                disabled={!canJoin}
                className="h-11 w-full rounded-full"
              >
                Join meeting
                <ArrowRight className="size-4" />
              </Button>
            </form>

            {outage ? (
              <div
                role="alert"
                className="mt-4 flex flex-col gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-3"
              >
                <p className="text-[0.8125rem] font-medium text-destructive">{outage.message}</p>
                <p className="text-[0.75rem] leading-relaxed text-muted-foreground">{outage.remedy}</p>
                <p className="telemetry text-[0.6875rem] text-muted-foreground">
                  engine: {meetingApiBase() || '(same origin)'}
                </p>
                <div className="flex gap-2 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void startMeeting()}
                    className="rounded-full"
                  >
                    Try again
                  </Button>
                  <Link
                    to="/rehearse"
                    className="inline-flex items-center rounded-full px-3 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Rehearse instead
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="mt-6 border-t border-border pt-4">
              <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
                Anyone with the code can join. No account needed — this room runs on Stash Live's own signalling
                relay and peer-to-peer WebRTC, so your video and audio never touch our servers as media.
              </p>
            </div>
          </motion.div>
        </main>
      </div>
    </MeetFrame>
  );
}

/**
 * Normalises anything that can come out of `reserveRoom` into the outage shape
 * the page renders.
 *
 * The classification matters more than the wording: telling someone to retry a
 * 404 is the difference between a five-minute fix and an afternoon of "have
 * you tried turning it off and on again".
 */
function toOutage(err: unknown): MeetingUnavailableError {
  if (err instanceof MeetingUnavailableError) return err;
  if (err instanceof Error) {
    return new MeetingUnavailableError('unknown', err.message, 'Try again, and check the browser console for detail.');
  }
  return new MeetingUnavailableError('unknown', 'Could not start a meeting.', 'Try again.');
}