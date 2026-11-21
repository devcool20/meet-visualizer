/**
 * Card editor.
 *
 * The one genuinely two-pane screen in the dashboard, so it keeps the split
 * layout. What changed is the material: the preview stage is now the espresso
 * "studio" surface shared with Studio and the virtual cam, and every form
 * control uses the shared input treatment.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { CardPreview } from "@/app/components/CardPreview";
import { Camera, Check, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useAuth } from "@/app/auth/AuthContext";
import { getApiClient, type ApiCard } from "@/lib/api";
import { Pill, StatusMessage, Surface, Telemetry } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";
import { PageHeader } from "./PageHeader";

const SOURCE_LABEL: Record<string, string> = {
  sample: "Sample",
  ai: "AI",
  notion: "Notion",
};

/** The shared label + control rhythm for this form. */
function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
       className="block text-[0.8125rem] font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-subtle">{hint}</p>}
    </div>
  );
}

export default function CardEditorPage() {
  const { id } = useParams();
  const { getAccessToken } = useAuth();
  const [card, setCard] = useState<ApiCard | null>(null);
  const [allCards, setAllCards] = useState<ApiCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phraseText, setPhraseText] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const saveQueue = useRef(Promise.resolve());
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [cameraStill, setCameraStill] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!id) return;
    const api = getApiClient(getAccessToken);
    api
      .getCard(id)
      .then((loaded) => { setCard(loaded); setPhraseText(loaded.phrases.join("\n")); })
      .catch(() => setError("Could not load this card. It may have been deleted."));
    api.listCards().then(setAllCards).catch(() => setAllCards([]));
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [id, getAccessToken]);

  async function save(patch: Partial<ApiCard>) {
    if (!card) return;
    const cardId = card.id;
    setPendingSaves((n) => n + 1);
    saveQueue.current = saveQueue.current.then(async () => {
      setSaveError(null);
      try {
        const updated = await getApiClient(getAccessToken).updateCard(cardId, patch);
        // A title may have been typed while an earlier blur-save was pending.
        setCard((current) => current?.id === updated.id ? { ...updated, title: current.title } : current);
      } catch {
        setSaveError("Could not save your changes. Your text is still here; try again.");
      } finally { setPendingSaves((n) => n - 1); }
    });
    await saveQueue.current;
  }

  /**
   * A camera still behind the glass card. Contrast has to be judged against a
   * real video background, not against white — but a denied permission is a
   * normal outcome, not an error the user needs to act on.
   */
  async function captureCameraStill() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => setTimeout(r, 400));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      setCameraStill(canvas.toDataURL("image/jpeg", 0.7));
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } catch {
      setCameraStill(null);
      setCameraError("Camera unavailable — the preview is shown on a neutral background instead.");
    } finally {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  /**
   * Local pre-flight. Mirrors the shipped tier-1 behaviour closely enough to
   * be useful, and catches the two mistakes that actually break matching: a
   * phrase that collides with another card, and one too far from any saved
   * phrase to fire.
   */
  function runTest() {
    if (!card) return;
    const normalized = testInput.trim().toLowerCase();
    if (!normalized) {
      setTestResult(null);
      return;
    }

    const conflict = allCards.find(
      (c) =>
        c.id !== card.id &&
        c.phrases.some((p) => {
          const saved = p.toLowerCase();
          return saved === normalized || normalized.includes(saved);
        }),
    );
    if (conflict) {
      setTestResult({ ok: false, message: `Too close to your “${conflict.title}” card — one of them will win.` });
      return;
    }

    const hit = phraseText.split("\n").map((p) => p.trim()).filter(Boolean).some((p) => {
      const saved = p.toLowerCase();
      return normalized.includes(saved) || saved.includes(normalized);
    });
    setTestResult({
      ok: hit,
      message: hit
        ? "Would fire on this phrase."
        : "Would not fire yet — try wording closer to one of your saved phrases.",
    });
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Card" description="Edit the phrases and settings for this card." />
        <StatusMessage tone="danger">{error}</StatusMessage>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="space-y-6">
        <PageHeader title="Card" />
        <Surface className="h-[420px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Library"
        title={card.title}
        description="Add the phrases you would naturally say out loud. The engine matches on what you say, not on a command."
        actions={
          <>
            <Pill tone={card.enabled ? "success" : "neutral"}>
              {card.enabled ? "Armed" : "Disabled"}
            </Pill>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/cards">Back to library</Link>
            </Button>
          </>
        }
      />

      {saveError && <StatusMessage tone="danger">{saveError} <button type="button" className="underline" onClick={() => save({ title: card.title, phrases: phraseText.split("\n").map((p) => p.trim()).filter(Boolean) })}>Try again</button></StatusMessage>}
      <p role="status" className="text-xs text-muted-foreground">{pendingSaves > 0 ? "Saving changes…" : saveError ? "Changes not saved" : "Changes save when you leave a field."}</p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── Preview ── */}
        <div className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <div
           className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-panel border border-border"
            style={{ background: "#141210" }}
          >
            {cameraStill && (
              <img
                src={cameraStill}
                alt=""
               className="absolute inset-0 size-full object-cover opacity-70"
              />
            )}
            <div className="relative h-full w-full p-5">
              {/* Reflect the in-progress title so the preview matches the form. */}
              <CardPreview spec={{ ...card.spec, title: card.title }} maxWidth={300} fitHeight />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={captureCameraStill}>
              <Camera className="size-3.5" strokeWidth={2} aria-hidden />
              Use my camera as background
            </Button>
            {cameraStill && (
              <Button variant="ghost" size="sm" onClick={() => setCameraStill(null)}>
                Clear
              </Button>
            )}
            <video ref={videoRef} playsInline muted className="hidden" />
          </div>
          {cameraError && <StatusMessage tone="neutral">{cameraError}</StatusMessage>}

          {/* Phrase pre-flight */}
          <Surface tone="flat" className="space-y-3 p-4">
            <label
              htmlFor="phrase-test"
             className="block text-[0.8125rem] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Test a phrase
            </label>
            <div className="flex gap-2">
              <Input
                id="phrase-test"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runTest()}
                placeholder="Type what you would say in a call…"
              />
              <Button onClick={runTest} disabled={!testInput.trim()}>
                Test
              </Button>
            </div>
            {testResult && (
              <p
                className={cn(
                  "flex items-start gap-2 text-sm",
                  testResult.ok ? "text-success" : "text-muted-foreground",
                )}
                role="status"
              >
                {testResult.ok ? (
                  <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                ) : (
                  <X className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                )}
                {testResult.message}
              </p>
            )}
          </Surface>
        </div>

        {/* ── Fields ── */}
        <div className="space-y-6">
          <Surface className="space-y-5 p-6">
            <Field label="Title" htmlFor="card-title">
              <Input
                id="card-title"
                value={card.title}
                onChange={(e) => setCard({ ...card, title: e.target.value })}
                onBlur={() => save({ title: card.title })}
              />
            </Field>

            <Field
              label="Trigger phrases"
              htmlFor="card-phrases"
              hint="One per line. Write them the way you would actually say them in conversation."
            >
              <textarea
                id="card-phrases"
                rows={5}
                value={phraseText}
                onChange={(e) => setPhraseText(e.target.value)}
                onBlur={() => save({ phrases: phraseText.split("\n").map((p) => p.trim()).filter(Boolean) })}
                className="w-full resize-y rounded-lg border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-muted-subtle focus-visible:border-brand/40"
                placeholder={"q2 revenue\nrevenue numbers\nhow much revenue"}
              />
            </Field>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
              <div>
                <p className="text-sm font-medium text-foreground">Armed for live calls</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Disabled cards are ignored by the matching engine.
                </p>
              </div>
              <Button
                variant={card.enabled ? "destructive" : "outline"}
                size="sm"
                disabled={pendingSaves > 0}
                onClick={() => save({ enabled: !card.enabled })}
              >
                {card.enabled ? "Disable" : "Arm"}
              </Button>
            </div>
          </Surface>

          <Surface tone="flat" className="flex items-center justify-between gap-4 p-4">
            <p className="text-xs text-muted-foreground">
              Card revision{" "}
              <Telemetry className="text-foreground">#{card.spec.revision}</Telemetry>
            </p>
            <Pill>{SOURCE_LABEL[card.source] ?? card.source}</Pill>
          </Surface>
        </div>
      </div>
    </div>
  );
}
