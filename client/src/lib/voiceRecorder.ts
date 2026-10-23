// Gravação de áudio em formato aceito pelo WhatsApp (API oficial da Meta).
// A Meta aceita áudio OGG/Opus, MP3, AAC/MP4 e AMR — mas NÃO aceita WebM, que é o que o
// Chrome/Edge gravam por padrão. Por isso:
//   1. Firefox: grava OGG/Opus nativamente (MediaRecorder).
//   2. Chrome/Edge: codifica Opus com WebCodecs (AudioEncoder) e monta o arquivo OGG aqui.
//   3. Safari: grava MP4/AAC nativamente.
//   4. Último recurso: WebM (avisa que pode não chegar no cliente).

export type MicErrorKind = "insecure" | "denied" | "notfound" | "busy" | "unknown";

export class MicError extends Error {
  constructor(public kind: MicErrorKind, message: string) {
    super(message);
  }
}

export interface VoiceRecording {
  /** Para a gravação e devolve o arquivo pronto para enviar */
  stop(): Promise<File>;
  /** Descarta a gravação */
  cancel(): void;
}

const SAMPLE_RATE = 48000;

export async function startVoiceRecording(): Promise<VoiceRecording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new MicError("insecure", "O navegador só libera o microfone em sites seguros (https).");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied", "Permissão do microfone negada.");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("notfound", "Nenhum microfone encontrado.");
    if (name === "NotReadableError") throw new MicError("busy", "O microfone está sendo usado por outro programa.");
    throw new MicError("unknown", "Não foi possível acessar o microfone.");
  }

  try {
    if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
      return nativeRecording(stream, "audio/ogg;codecs=opus", "ogg", "audio/ogg");
    }
    if (await canEncodeOpus()) {
      return await webCodecsOggRecording(stream);
    }
    if (MediaRecorder.isTypeSupported("audio/mp4")) {
      return nativeRecording(stream, "audio/mp4", "m4a", "audio/mp4");
    }
    return nativeRecording(stream, "audio/webm", "webm", "audio/webm");
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
}

// ─── MediaRecorder nativo (Firefox, Safari, último recurso) ───────────────────

function nativeRecording(stream: MediaStream, recordMime: string, ext: string, fileMime: string): VoiceRecording {
  const recorder = new MediaRecorder(stream, { mimeType: recordMime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () => new Promise<File>((resolve) => {
      recorder.onstop = () => {
        release();
        resolve(new File([new Blob(chunks, { type: fileMime })], `audio.${ext}`, { type: fileMime }));
      };
      recorder.stop();
    }),
    cancel: () => { recorder.onstop = null; if (recorder.state !== "inactive") recorder.stop(); release(); },
  };
}

// ─── Chrome/Edge: Opus via WebCodecs + container OGG ──────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
async function canEncodeOpus(): Promise<boolean> {
  const w = window as any;
  if (typeof w.AudioEncoder === "undefined" || typeof w.MediaStreamTrackProcessor === "undefined") return false;
  try {
    const res = await w.AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 32000 });
    return !!res?.supported;
  } catch {
    return false;
  }
}

async function webCodecsOggRecording(stream: MediaStream): Promise<VoiceRecording> {
  const w = window as any;
  // AudioContext a 48 kHz e saída mono: o Opus trabalha em 48 kHz
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = ctx.createMediaStreamSource(stream);
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 1;
  dest.channelCountMode = "explicit";
  source.connect(dest);
  const track = dest.stream.getAudioTracks()[0];
  const reader = new w.MediaStreamTrackProcessor({ track }).readable.getReader();

  const packets: Uint8Array[] = [];
  const durationsUs: number[] = [];
  let opusHead: Uint8Array | null = null;
  let channels = 1;
  let configured = false;
  let failure: unknown = null;

  const encoder = new w.AudioEncoder({
    output: (chunk: any, meta: any) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      packets.push(buf);
      durationsUs.push(chunk.duration || 20000);
      const desc = meta?.decoderConfig?.description;
      if (desc && !opusHead) {
        const bytes = desc instanceof ArrayBuffer ? new Uint8Array(desc) : new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
        if (ascii(bytes.subarray(0, 8)) === "OpusHead") opusHead = bytes.slice();
      }
    },
    error: (e: unknown) => { failure = e; },
  });

  let running = true;
  const pump = (async () => {
    while (running) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      try {
        if (!configured) {
          channels = value.numberOfChannels;
          encoder.configure({ codec: "opus", sampleRate: value.sampleRate, numberOfChannels: channels, bitrate: 32000 });
          configured = true;
        }
        encoder.encode(value);
      } finally {
        value.close();
      }
    }
  })();

  const release = async () => {
    running = false;
    await reader.cancel().catch(() => {});
    track.stop();
    stream.getTracks().forEach((t) => t.stop());
    await pump.catch(() => {});
    await ctx.close().catch(() => {});
  };

  return {
    stop: async () => {
      await release();
      if (configured) await encoder.flush();
      encoder.close();
      if (failure) throw failure;
      const head = opusHead ?? buildOpusHead(channels, 312);
      const ogg = buildOggOpus(head, packets, durationsUs);
      return new File([ogg], "audio.ogg", { type: "audio/ogg" });
    },
    cancel: () => {
      void release().then(() => { try { encoder.close(); } catch { /* já fechado */ } });
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Container OGG (RFC 3533) com Opus (RFC 7845) ─────────────────────────────

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function buildOpusHead(channels: number, preSkip: number): Uint8Array {
  const b = new Uint8Array(19);
  const v = new DataView(b.buffer);
  b.set([...("OpusHead")].map((c) => c.charCodeAt(0)), 0);
  b[8] = 1;                         // versão
  b[9] = channels;
  v.setUint16(10, preSkip, true);
  v.setUint32(12, SAMPLE_RATE, true);
  v.setInt16(16, 0, true);          // ganho
  b[18] = 0;                        // mapeamento de canais (mono/estéreo)
  return b;
}

function buildOpusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("Grafinorte");
  const b = new Uint8Array(8 + 4 + vendor.length + 4);
  const v = new DataView(b.buffer);
  b.set([...("OpusTags")].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(8, vendor.length, true);
  b.set(vendor, 12);
  v.setUint32(12 + vendor.length, 0, true); // sem comentários
  return b;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
  return crc;
}

function lacing(size: number): number[] {
  const out: number[] = [];
  while (size >= 255) { out.push(255); size -= 255; }
  out.push(size);
  return out;
}

function oggPage(packets: Uint8Array[], granule: bigint, serial: number, seq: number, headerType: number): Uint8Array {
  const segs = packets.flatMap((p) => lacing(p.length));
  const bodyLen = packets.reduce((s, p) => s + p.length, 0);
  const page = new Uint8Array(27 + segs.length + bodyLen);
  const v = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0;
  page[5] = headerType;
  v.setBigInt64(6, granule, true);
  v.setUint32(14, serial, true);
  v.setUint32(18, seq, true);
  v.setUint32(22, 0, true);              // CRC calculado depois
  page[26] = segs.length;
  page.set(segs, 27);
  let off = 27 + segs.length;
  for (const p of packets) { page.set(p, off); off += p.length; }
  v.setUint32(22, oggCrc(page), true);
  return page;
}

function buildOggOpus(head: Uint8Array, packets: Uint8Array[], durationsUs: number[]): Blob {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [oggPage([head], 0n, serial, 0, 0x02), oggPage([buildOpusTags()], 0n, serial, 1, 0)];
  let seq = 2;
  let granule = 0n;
  let batch: Uint8Array[] = [];
  let batchSegs = 0;

  const flush = (last: boolean) => {
    if (batch.length === 0 && !last) return;
    pages.push(oggPage(batch, granule, serial, seq++, last ? 0x04 : 0));
    batch = [];
    batchSegs = 0;
  };

  packets.forEach((p, i) => {
    const segs = lacing(p.length).length;
    // Uma página aceita no máximo 255 segmentos; ~50 pacotes (1 s) por página
    if (batchSegs + segs > 255 || batch.length >= 50) flush(false);
    batch.push(p);
    batchSegs += segs;
    granule += BigInt(Math.round((durationsUs[i] * SAMPLE_RATE) / 1_000_000));
  });
  flush(true);
  return new Blob(pages as BlobPart[], { type: "audio/ogg" });
}
