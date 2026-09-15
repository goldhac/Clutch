/**
 * Phase 0 — transcribe a podcast episode (ours or NotebookLM's) into a
 * speaker-labelled, timestamped transcript, so two episodes can be compared
 * on the same footing. NotebookLM offers no transcript; ours has a script, but
 * transcribing the audio measures what the listener actually hears.
 *
 *   npx tsx scripts/phase0/transcribe.ts <audio file> <out.md> [voice]
 *
 * Uploads via the Gemini Files API (a 24-min episode is too large to inline),
 * transcribes with Gemini 2.5 Flash. Audio input bills ~32 tokens/sec at
 * $1.00 / 1M → ~$0.05 for 24 minutes.
 */
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", quiet: true });

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

const [audioPath, outPath, labelMode] = process.argv.slice(2);
/** "voice": label by how each voice sounds, not order of appearance — ground truth for voice-swap checks. */
const BY_VOICE = labelMode === "voice";
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("GEMINI_API_KEY missing from .env.local");
if (!audioPath || !outPath) throw new Error("usage: transcribe.ts <audio file> <out.md>");

const MODEL = "gemini-2.5-flash";
const AUDIO_IN_PER_M = 1.0;
const OUT_PER_M = 2.5;
const BASE = "https://generativelanguage.googleapis.com";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".wav": "audio/wav",
  ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac", ".webm": "audio/webm",
};

const LABELS = BY_VOICE
  ? `- Label every paragraph by the VOICE, judged only by how it sounds: WOMAN or MAN. Never infer the
  speaker from what is said or from turn-taking; if a voice changes mid-paragraph, split it.
- New paragraph at every change of voice, starting with a timestamp: [mm:ss] WOMAN: …`
  : `- Label the hosts HOST 1 (the first voice you hear) and HOST 2. Keep the labels consistent.
- New paragraph at every change of speaker, starting with a timestamp: [mm:ss] HOST 1: …`;

const PROMPT = `Transcribe this two-host podcast episode VERBATIM.

${LABELS}
- Include everything spoken, including short reactions ("right", "mm-hmm", "wow") and false starts.
  Do not summarise, tidy up, or skip repetition.
- If one host interjects mid-sentence, give the interjection its own paragraph.
- Mark long silences as [pause ~Ns]. No other commentary.`;

async function main() {
  const mimeType = MIME[extname(audioPath).toLowerCase()];
  if (!mimeType) throw new Error(`unknown audio type: ${audioPath}`);
  const bytes = statSync(audioPath).size;
  const t0 = Date.now();

  const start = await fetch(`${BASE}/upload/v1beta/files?key=${API_KEY}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `phase0-${Date.now()}` } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error(`upload start ${start.status}: ${await start.text()}`);

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: readFileSync(audioPath),
  });
  const { file } = (await up.json()) as { file: { uri: string; name: string; state: string } };
  console.error(`uploaded ${(bytes / 1e6).toFixed(1)} MB → ${file.name}`);

  let state = file.state;
  while (state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 3000));
    const f = (await (await fetch(`${BASE}/v1beta/${file.name}?key=${API_KEY}`)).json()) as { state: string };
    state = f.state;
  }
  if (state !== "ACTIVE") throw new Error(`file state ${state}`);

  const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ file_data: { mime_type: mimeType, file_uri: file.uri } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 65536, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const finish = json.candidates?.[0]?.finishReason;

  await fetch(`${BASE}/v1beta/${file.name}?key=${API_KEY}`, { method: "DELETE" });

  const inTok = json.usageMetadata?.promptTokenCount ?? 0;
  const outTok = json.usageMetadata?.candidatesTokenCount ?? 0;
  const cost = (inTok * AUDIO_IN_PER_M + outTok * OUT_PER_M) / 1e6;
  writeFileSync(outPath, text.trim() + "\n");
  console.error(
    `${text.split(/\s+/).length} words · finish ${finish} · ${inTok} in / ${outTok} out tokens · ` +
      `$${cost.toFixed(3)} · ${((Date.now() - t0) / 1000).toFixed(0)}s → ${outPath}`,
  );
}

main().catch((e) => {
  console.error(`FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
