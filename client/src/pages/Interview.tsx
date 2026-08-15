import { useFirebaseAuth } from "@/_core/hooks/useFirebaseAuth";
import { signInWithGoogle } from "@/lib/firebase";
import { browserVoiceMessage, interviewRequestErrorMessage, microphoneErrorMessage, normaliseAudioMimeType, preferredEnglishVoice, type AudioMimeType } from "@/lib/interviewBrowser";
import { extractResumeText } from "@/lib/resumeText";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, Check, FileText, Mic, Pause, RotateCcw, Sparkles, Square, UploadCloud, Volume2, X } from "lucide-react";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const ROLE_EXAMPLES = ["ai engineer", "software engineer", "data analyst", "product manager", "product designer"];
type InterviewStart = { sessionId: string; questionNumber: number; maxQuestions: number; question: string; focus: string; resumeUsed: boolean };
type Feedback = { score: number; feedback: string; strength: string; focus: string; nextCue: string };
type Report = { overallScore: number; summary: string; strengths: string[]; focusAreas: string[]; nextSteps: string[] };
type AnswerResult = { transcript: string; feedback: Feedback; complete: boolean; report?: Report; nextQuestion?: string; nextFocus?: string; questionNumber?: number };
type ChunkSubmission = { complete: boolean; receivedChunks: number; totalChunks: number; result?: AnswerResult };
const AUDIO_CHUNK_BASE64_CHARS = 56_000;
const VOICE_RECORDING_BITS_PER_SECOND = 24_000;
function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("we couldn't read that recording. record it again and retry."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(blob);
  });
}
function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function Stars({ score }: { score: number }) { return <div className="flex gap-1">{[1,2,3,4,5].map(star => <span key={star} className={star <= score ? "text-[#e6cece]" : "text-white/15"}>●</span>)}</div>; }

export default function Interview() {
  const { isAuthenticated, loading, configured } = useFirebaseAuth();
  const [, setLocation] = useLocation();
  const startInterview = trpc.interview.start.useMutation();
  const submitAnswerChunk = trpc.interview.submitAnswerChunk.useMutation();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [preparingResume, setPreparingResume] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [practice, setPractice] = useState<InterviewStart | null>(null);
  const [question, setQuestion] = useState("");
  const [focus, setFocus] = useState("");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [caption, setCaption] = useState("your question will appear here as a spoken subtitle.");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "speaking" | "unavailable">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickerRef = useRef<number | null>(null);
  const voiceWaitRef = useRef<number | null>(null);

  useEffect(() => () => { window.speechSynthesis?.cancel(); if (tickerRef.current) window.clearInterval(tickerRef.current); if (voiceWaitRef.current) window.clearTimeout(voiceWaitRef.current); }, []);
  const speak = (words: string) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setVoiceState("unavailable"); toast.error("browser voice isn’t available here. use the subtitles or try Chrome, Edge, or Firefox."); return; }
    const engine = window.speechSynthesis;
    const speakWithAvailableVoice = () => {
      engine.cancel();
      const utterance = new SpeechSynthesisUtterance(words);
      const voice = preferredEnglishVoice(engine.getVoices());
      if (voice) utterance.voice = voice;
      utterance.rate = .94;
      utterance.pitch = 1;
      utterance.onstart = () => setVoiceState("speaking");
      utterance.onend = () => setVoiceState("idle");
      utterance.onerror = event => { if (event.error !== "interrupted" && event.error !== "canceled") setVoiceState("unavailable"); };
      engine.resume();
      engine.speak(utterance);
    };
    if (engine.getVoices().length) { speakWithAvailableVoice(); return; }
    setVoiceState("idle");
    const onVoicesChanged = () => { window.clearTimeout(voiceWaitRef.current ?? undefined); engine.removeEventListener("voiceschanged", onVoicesChanged); speakWithAvailableVoice(); };
    engine.addEventListener("voiceschanged", onVoicesChanged, { once: true });
    voiceWaitRef.current = window.setTimeout(() => { engine.removeEventListener("voiceschanged", onVoicesChanged); setVoiceState("unavailable"); }, 1500);
  };
  const primeSpeech = () => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const primer = new SpeechSynthesisUtterance(" ");
    primer.volume = 0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(primer);
  };
  const selectResume = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("keep your resume under 5mb."); return; }
    if (!(file.type === "application/pdf" || file.type === "text/plain")) { toast.error("use a pdf or txt resume for now."); return; }
    setResume(file); setResumeText(""); setPreparingResume(true);
    try { setResumeText(await extractResumeText(file)); }
    catch (error) { setResume(null); toast.error(interviewRequestErrorMessage(error, "we couldn't prepare that resume. choose it again and retry.")); }
    finally { setPreparingResume(false); }
  };
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { void selectResume(event.target.files?.[0]); };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(false); void selectResume(event.dataTransfer.files?.[0]); };
  const begin = async () => {
    if (!name.trim()) { toast.error("add your name to start your practice."); return; }
    if (!role.trim()) { toast.error("tell us the role you're aiming for to start your practice."); return; }
    primeSpeech();
    try {
      if (resume && !resumeText) { toast.error("your resume is still being prepared. it will be ready in a moment."); return; }
      const resumeInput = resume && resumeText ? { name: resume.name, text: resumeText } : undefined;
      const started = await startInterview.mutateAsync({ name: name.trim(), role, resume: resumeInput });
      setPractice(started); setQuestion(started.question); setFocus(started.focus); setQuestionNumber(started.questionNumber); setCaption(started.question); setTranscript(""); setFeedback(null); setVoiceState("idle");
      speak(started.question);
    } catch (error) { toast.error(interviewRequestErrorMessage(error, "we couldn't start your practice. try again.")); }
    finally { setPreparingResume(false); }
  };
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("your browser doesn’t support microphone capture. open seekhao in Chrome, Edge, or Firefox.");
      if (!("MediaRecorder" in window)) throw new Error("your browser doesn’t support recording yet. open seekhao in Chrome, Edge, or Firefox.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred, audioBitsPerSecond: VOICE_RECORDING_BITS_PER_SECOND }) : new MediaRecorder(stream, { audioBitsPerSecond: VOICE_RECORDING_BITS_PER_SECOND });
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); recorderRef.current = null; const mimeType = normaliseAudioMimeType(recorder.mimeType || "audio/webm"); const blob = new Blob(chunksRef.current, { type: mimeType }); if (!blob.size) { setCaption("we didn’t receive an audio sample. check your microphone permission and try again."); toast.error("we didn’t receive an audio sample. check your microphone permission and try again."); return; } void uploadAnswer(blob, mimeType); };
      recorder.start(); recorderRef.current = recorder; setElapsed(0); setRecording(true);
      tickerRef.current = window.setInterval(() => setElapsed(value => value + 1), 1000);
      setCaption("listening. take your time — your words will come back as subtitles.");
    } catch (error) { toast.error(microphoneErrorMessage(error)); }
  };
  const stopRecording = () => { if (!recorderRef.current || recorderRef.current.state === "inactive") return; recorderRef.current.stop(); setRecording(false); if (tickerRef.current) window.clearInterval(tickerRef.current); };
  const uploadAnswer = async (blob: Blob, mimeType: AudioMimeType) => {
    if (!practice) return;
    setCaption("turning your answer into subtitles and listening for the signal…");
    setSubmittingAnswer(true);
    try {
      if (blob.size > 16 * 1024 * 1024) throw new Error("keep each answer recording under 16mb");
      const audioBase64 = await readBlobAsBase64(blob);
      const totalChunks = Math.ceil(audioBase64.length / AUDIO_CHUNK_BASE64_CHARS);
      const uploadId = crypto.randomUUID();
      let result: AnswerResult | undefined;
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        setCaption(`sending your answer ${chunkIndex + 1} of ${totalChunks}…`);
        const chunk = await submitAnswerChunk.mutateAsync({ sessionId: practice.sessionId, uploadId, chunkIndex, chunkCount: totalChunks, mimeType, audioBase64: audioBase64.slice(chunkIndex * AUDIO_CHUNK_BASE64_CHARS, (chunkIndex + 1) * AUDIO_CHUNK_BASE64_CHARS) }) as ChunkSubmission;
        if (chunkIndex === totalChunks - 1) result = chunk.result;
      }
      if (!result) throw new Error("the recording upload was interrupted. record your answer again and retry.");
      setTranscript(result.transcript); setCaption(result.transcript); setFeedback(result.feedback);
      speak(`${result.feedback.feedback}. next time: ${result.feedback.nextCue}`);
      if (result.complete && result.report) setReport(result.report);
      else if (!result.complete && result.nextQuestion) { setQuestion(result.nextQuestion); setFocus(result.nextFocus || ""); setQuestionNumber(result.questionNumber || questionNumber + 1); }
    } catch (error) { const message = interviewRequestErrorMessage(error, "we couldn't process that answer."); setCaption(message); toast.error(message); }
    finally { setSubmittingAnswer(false); }
  };
  const continuePractice = () => { if (!question || report) return; setTranscript(""); setFeedback(null); setCaption(question); speak(question); };
  const reset = () => { setPractice(null); setReport(null); setFeedback(null); setTranscript(""); setCaption("your question will appear here as a spoken subtitle."); };

  if (loading) return <main className="dusk-page grid min-h-screen place-items-center text-sm text-white/60">opening your practice room…</main>;
  if (!isAuthenticated) return <main className="dusk-page grid min-h-screen place-items-center px-5"><div className="glass-panel max-w-md rounded-[2rem] p-3"><div className="gradient-card overflow-hidden rounded-[1.6rem] p-8 text-center text-white"><span className="seekhao-wordmark text-4xl font-medium">seekhao</span><div className="mx-auto mt-8 flex h-10 items-end justify-center gap-1.5">{[16,28,38,21,34,14,29].map((height,index)=><span className="wave-bar w-1.5 rounded-full bg-white" style={{height}} key={index} />)}</div><p className="mt-7 text-sm text-white/68">your practice room is ready</p><h1 className="mt-2 text-3xl tracking-[-.06em]">sign in to continue.</h1><button onClick={() => configured ? signInWithGoogle().catch(() => toast.error("we couldn't open google sign-in.")) : toast.error("google sign-in will be ready once firebase is connected.")} className="mt-7 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#111111]">continue with google</button></div></div></main>;
  if (report) return <ReportView name={name} role={role} report={report} onAgain={reset} onHome={() => setLocation("/")} />;
  if (!practice) return <Onboarding name={name} role={role} resume={resume} dragging={dragging} busy={preparingResume || startInterview.isPending} onName={setName} onRole={setRole} onFileChange={onFileChange} onDrop={onDrop} onDragging={setDragging} onRemove={() => { setResume(null); setResumeText(""); }} onBegin={begin} onBack={() => setLocation("/")} />;
  return <PracticeRoom name={name} role={role} question={question} focus={focus} number={questionNumber} max={practice.maxQuestions} caption={caption} transcript={transcript} feedback={feedback} recording={recording} elapsed={elapsed} busy={submittingAnswer || submitAnswerChunk.isPending} voiceState={voiceState} onSpeak={() => { setCaption(question); speak(question); }} onRecord={startRecording} onStop={stopRecording} onContinue={continuePractice} onExit={reset} />;
}

function Onboarding({ name, role, resume, dragging, busy, onName, onRole, onFileChange, onDrop, onDragging, onRemove, onBegin, onBack }: { name: string; role: string; resume: File | null; dragging: boolean; busy: boolean; onName: (value: string) => void; onRole: (value: string) => void; onFileChange: (event: ChangeEvent<HTMLInputElement>) => void; onDrop: (event: DragEvent<HTMLLabelElement>) => void; onDragging: (value: boolean) => void; onRemove: () => void; onBegin: () => void; onBack: () => void }) {
  return <main className="dusk-page flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-12"><header className="mx-auto flex w-full max-w-[1120px] items-center justify-between"><button onClick={onBack} className="muted-link inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> back</button><span className="seekhao-wordmark text-2xl font-medium">seekhao</span><span className="text-sm text-white/45">setup 01 / 01</span></header><section className="mx-auto flex w-full max-w-[780px] flex-1 items-center py-14 sm:py-20"><div className="w-full enter-up"><div className="mb-7 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12"><div className="h-full w-full rounded-full bg-[#b9a0a0]" /></div><span className="text-sm text-white/45">your context</span></div><p className="text-sm text-[#b9a0a0]">let's make this yours</p><h1 className="mt-3 max-w-xl text-4xl leading-[.98] tracking-[-.065em] sm:text-5xl">what role are you getting ready for?</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55">seekhao will make the questions fit your target role. add your resume if you want the conversation to know your experience, too.</p><div className="mt-10 grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm text-white/70">your name</span><input value={name} onChange={event => onName(event.target.value)} placeholder="what should we call you?" className="h-14 w-full rounded-xl border border-white/12 bg-white/7 px-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-[#b9a0a0]/70 focus:bg-white/10" /></label><label className="block"><span className="mb-2 block text-sm text-white/70">role you're applying for</span><input value={role} onChange={event => onRole(event.target.value)} placeholder="type it in your own words, e.g. ai engineer" className="h-14 w-full rounded-xl border border-white/12 bg-white/7 px-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-[#b9a0a0]/70 focus:bg-white/10" /></label></div><div className="mt-6"><p className="mb-2 text-sm text-white/70">add your resume <span className="text-white/35">(optional)</span></p><label onDrop={onDrop} onDragOver={event => { event.preventDefault(); onDragging(true); }} onDragLeave={() => onDragging(false)} className={`group flex min-h-[155px] cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border border-dashed px-5 text-center transition ${dragging ? "border-[#e6cece] bg-[#b9a0a0]/10" : "border-white/20 bg-white/[.035] hover:border-[#b9a0a0]/65 hover:bg-white/[.065]"}`}><input type="file" accept=".pdf,.txt" onChange={onFileChange} className="sr-only" />{resume ? <><FileText className="h-6 w-6 text-[#e6cece]" /><span className="mt-3 text-sm text-white/85">{resume.name}</span><span className="mt-1 text-xs text-white/40">resume attached · click to replace</span><button onClick={event => { event.preventDefault(); onRemove(); }} className="mt-3 inline-flex items-center gap-1 text-xs text-[#e6cece]">remove <X className="h-3 w-3" /></button></> : <><UploadCloud className="h-6 w-6 text-[#b9a0a0]" /><span className="mt-3 text-sm text-white/80">drop your resume here, or click to choose</span><span className="mt-1 text-xs text-white/40">pdf or txt · up to 5mb</span></>}</label></div><div className="mt-8 flex justify-end"><button onClick={onBegin} disabled={!name.trim() || busy} className="rose-button inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45">{busy ? "shaping your room…" : "start my practice"} <ArrowRight className="h-4 w-4" /></button></div></div></section></main>;
}

function PracticeRoom({ name, role, question, focus, number, max, caption, transcript, feedback, recording, elapsed, busy, voiceState, onSpeak, onRecord, onStop, onContinue, onExit }: { name: string; role: string; question: string; focus: string; number: number; max: number; caption: string; transcript: string; feedback: Feedback | null; recording: boolean; elapsed: number; busy: boolean; voiceState: "idle" | "speaking" | "unavailable"; onSpeak: () => void; onRecord: () => void; onStop: () => void; onContinue: () => void; onExit: () => void }) {
  return <main className="dusk-page min-h-screen px-4 py-4 sm:px-7 sm:py-6"><header className="mx-auto flex max-w-[1500px] items-center justify-between"><button onClick={onExit} className="muted-link inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> leave practice</button><span className="seekhao-wordmark text-2xl font-medium">seekhao</span><span className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-white/58">{number} of {max}</span></header><div className="mx-auto mt-6 grid max-w-[1500px] gap-4 lg:grid-cols-[.78fr_1.22fr]"><aside className="glass-panel flex min-h-[660px] flex-col rounded-[1.6rem] p-5 sm:p-6"><p className="text-sm text-[#b9a0a0]">your practice</p><h1 className="mt-2 text-2xl tracking-[-.055em]">{role}</h1><p className="mt-1 text-sm text-white/44">with {name}</p><div className="mt-10 border-t border-white/10 pt-6"><p className="text-xs text-white/38">question {number}</p><p className="mt-3 text-base leading-relaxed text-white/76">{question}</p></div><div className="mt-auto rounded-[1.25rem] border border-white/10 bg-black/20 p-4"><p className="text-xs text-white/42">question focus</p><p className="mt-2 text-sm leading-relaxed text-[#e6cece]">{focus}</p></div></aside><section className="glass-panel flex min-h-[660px] flex-col overflow-hidden rounded-[1.6rem]"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6"><span className="text-sm text-white/58">spoken subtitles</span><button onClick={onSpeak} className="muted-link inline-flex items-center gap-2 text-sm"><Volume2 className="h-4 w-4" /> replay question</button></div><div className="flex flex-1 flex-col px-5 py-8 sm:px-8"><div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center"><p className="mb-5 text-xs tracking-[.14em] text-[#b9a0a0]">{recording ? "LISTENING NOW" : feedback ? "COACH NOTES" : busy ? "PROCESSING" : "YOUR QUESTION"}</p>{feedback ? <div className="enter-up rounded-[1.4rem] border border-[#b9a0a0]/25 bg-[#b9a0a0]/8 p-5 sm:p-6"><div className="flex items-start justify-between gap-5"><div><p className="text-xl tracking-[-.05em]">your answer landed at</p><p className="mt-2 text-4xl tracking-[-.08em] text-[#e6cece]">{feedback.score} / 5</p></div><Stars score={feedback.score} /></div><p className="mt-6 text-lg leading-relaxed text-white/83">{feedback.feedback}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-black/18 p-3"><p className="text-xs text-white/40">keep</p><p className="mt-1 text-sm text-white/75">{feedback.strength}</p></div><div className="rounded-xl bg-black/18 p-3"><p className="text-xs text-white/40">sharpen</p><p className="mt-1 text-sm text-white/75">{feedback.focus}</p></div></div><p className="mt-5 text-sm text-[#e6cece]">next cue: {feedback.nextCue}</p></div> : <><p className="text-3xl leading-[1.15] tracking-[-.06em] text-white sm:text-5xl">“{caption}”</p>{transcript && <div className="mt-8 border-l border-[#e6cece]/60 pl-4"><p className="text-xs text-white/38">what seekhao heard</p><p className="mt-2 text-base leading-relaxed text-white/65">{transcript}</p></div>}</>}</div><div className="mt-5 border-t border-white/10 pt-5" aria-live="polite">{voiceState === "unavailable" && <p className="mb-4 max-w-2xl text-xs leading-relaxed text-[#e6cece]/75">{browserVoiceMessage()}</p>}<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">{feedback ? <button onClick={onContinue} className="rose-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium">next question <ArrowRight className="h-4 w-4" /></button> : <div className="flex items-center gap-3 text-sm text-white/48"><span className={`h-2.5 w-2.5 rounded-full ${recording ? "bg-[#e6cece] shadow-[0_0_0_5px_rgba(230,206,206,.12)]" : "bg-white/22"}`} />{recording ? `recording ${formatTime(elapsed)}` : busy ? "listening to your answer" : "ready when you are"}</div>}{!feedback && <button onClick={recording ? onStop : onRecord} disabled={busy} className={`inline-flex min-w-[190px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition ${recording ? "border border-[#e6cece]/35 bg-[#794747]/60 text-white" : "rose-button"} disabled:opacity-50`}>{recording ? <><Square className="h-4 w-4 fill-current" /> finish answer</> : <><Mic className="h-4 w-4" /> answer out loud</>}</button>}</div></div></div></section></div></main>;
}

function ReportView({ name, role, report, onAgain, onHome }: { name: string; role: string; report: Report; onAgain: () => void; onHome: () => void }) {
  return <main className="dusk-page min-h-screen px-5 py-8 sm:px-8 lg:px-12"><header className="mx-auto flex max-w-[1120px] items-center justify-between"><span className="seekhao-wordmark text-2xl font-medium">seekhao</span><button onClick={onHome} className="muted-link text-sm">home</button></header><section className="mx-auto max-w-[1120px] py-14 lg:py-20"><p className="text-sm text-[#b9a0a0]">practice complete · {role}</p><div className="mt-3 flex flex-col justify-between gap-8 md:flex-row md:items-end"><div><h1 className="text-5xl tracking-[-.07em] sm:text-6xl">you did the work,<br />{name}.</h1><p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">{report.summary}</p></div><div className="gradient-card rounded-[1.5rem] px-7 py-6 text-white"><p className="text-sm text-white/65">overall signal</p><p className="mt-1 text-5xl tracking-[-.08em]">{report.overallScore}<span className="text-xl"> / 5</span></p></div></div><div className="mt-12 grid gap-4 md:grid-cols-3">{[["what carried",report.strengths],["what to sharpen",report.focusAreas],["your next practice",report.nextSteps]].map(([title,items])=><div key={String(title)} className="glass-panel rounded-[1.4rem] p-6"><p className="text-sm text-[#b9a0a0]">{String(title)}</p><ul className="mt-5 space-y-4">{(items as string[]).map(item=><li key={item} className="flex gap-2 text-sm leading-relaxed text-white/72"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#e6cece]" />{item}</li>)}</ul></div>)}</div><div className="mt-10 flex flex-wrap gap-3"><button onClick={onAgain} className="rose-button inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium"><RotateCcw className="h-4 w-4" /> practise again</button><button onClick={onHome} className="rounded-full border border-white/16 bg-white/5 px-5 py-3 text-sm text-white/72 transition hover:bg-white/10">back home</button></div></section></main>;
}
