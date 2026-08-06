import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GlassCard } from '@stash/card-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient, type ApiCard } from '@/lib/api';

/**
 * Card editor (plan §4.3): form on the left, live preview on the right,
 * composited over a still frame from the user's camera so glass contrast
 * is judged against reality. "Test this phrase" runs a lightweight local
 * approximation of the real matcher (exact/substring against existing
 * phrases across the account) and reports "would fire" / "too similar".
 */
export default function CardEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const [card, setCard] = useState<ApiCard | null>(null);
  const [allCards, setAllCards] = useState<ApiCard[]>([]);
  const [title, setTitle] = useState('');
  const [phrasesText, setPhrasesText] = useState('');
  const [testPhrase, setTestPhrase] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [cameraStill, setCameraStill] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const api = getApiClient(getAccessToken);
    api.getCard(id).then((c) => {
      setCard(c);
      setTitle(c.title);
      setPhrasesText(c.phrases.join('\n'));
    });
    api.listCards().then(setAllCards);
  }, [id, getAccessToken]);

  async function captureCameraStill() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setCameraStill(canvas.toDataURL('image/jpeg'));
      track.stop();
    } catch {
      setCameraStill(null);
    }
  }

  function runPhraseTest() {
    if (!card) return;
    const normalized = testPhrase.trim().toLowerCase();
    if (!normalized) {
      setTestResult(null);
      return;
    }
    const conflict = allCards.find(
      (c) =>
        c.id !== card.id &&
        c.phrases.some((p) => p.toLowerCase() === normalized || normalized.includes(p.toLowerCase())),
    );
    if (conflict) {
      setTestResult(`Too similar to your "${conflict.title}" card`);
      return;
    }
    const exact = card.phrases.some((p) => normalized.includes(p.toLowerCase()) || p.toLowerCase().includes(normalized));
    setTestResult(exact ? 'Would fire (92%)' : 'Would not fire yet — try a phrase closer to your saved ones');
  }

  async function handleSave() {
    if (!card) return;
    setSaving(true);
    const api = getApiClient(getAccessToken);
    const phrases = phrasesText.split('\n').map((p) => p.trim()).filter(Boolean);
    await api.updateCard(card.id, { title, phrases });
    setSaving(false);
    navigate('/dashboard/cards');
  }

  if (!card) {
    return <p className="text-sm" style={{ color: '#5A5550' }}>Loading…</p>;
  }

  const previewSpec = { ...card.spec, title };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-5">
        <h1 className="text-2xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Edit card
        </h1>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: '#5A5550' }}>
            Title
          </label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: '#5A5550' }}>
            Trigger phrases (one per line)
          </label>
          <textarea
            className="w-full min-h-32 rounded-md border p-2 text-sm"
            style={{ borderColor: 'rgba(26,21,18,0.12)' }}
            value={phrasesText}
            onChange={(e) => setPhrasesText(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide block" style={{ color: '#5A5550' }}>
            Test this phrase
          </label>
          <div className="flex gap-2">
            <Input value={testPhrase} onChange={(e) => setTestPhrase(e.target.value)} placeholder="Say it like you would in a meeting" />
            <Button variant="outline" onClick={runPhraseTest}>
              Test
            </Button>
          </div>
          {testResult && (
            <p className="text-sm" style={{ color: testResult.startsWith('Would fire') ? '#2e7d32' : '#5A5550' }} data-testid="test-phrase-result">
              {testResult}
            </p>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard/cards')}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5A5550' }}>
            Live preview
          </label>
          <Button variant="outline" size="sm" onClick={captureCameraStill}>
            Use my camera as background
          </Button>
        </div>
        <div
          className="relative rounded-2xl overflow-hidden flex items-center justify-center min-h-80"
          style={{ background: cameraStill ? undefined : '#1A1512' }}
        >
          {cameraStill && (
            <img src={cameraStill} alt="Camera still frame" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="relative z-10">
            <GlassCard spec={previewSpec} width={300} />
          </div>
        </div>
      </div>
    </div>
  );
}
