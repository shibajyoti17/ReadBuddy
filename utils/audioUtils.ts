export const startRecording = async (): Promise<MediaRecorder> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.start();
  return mediaRecorder;
};

export const stopRecording = (mediaRecorder: MediaRecorder): Promise<Blob> => {
  return new Promise((resolve) => {
    const audioChunks: BlobPart[] = [];
    mediaRecorder.addEventListener("dataavailable", (event) => {
      audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // Default to wav wrapper for blob
      resolve(audioBlob);
    });

    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Stop stream
  });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Audio Playback for Gemini TTS (PCM Data) ---

let audioContext: AudioContext | null = null;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const playPCMAudio = async (base64Audio: string): Promise<void> => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const data = base64ToUint8Array(base64Audio);
    
    // Gemini 2.5 Flash TTS Output is PCM 24kHz Mono (Little Endian Int16)
    const sampleRate = 24000;
    const numChannels = 1;
    
    // Create view for Int16 data
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    
    const buffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

  } catch (e) {
    console.error("Audio playback error:", e);
  }
};

// --- Live API Helpers ---

/**
 * Converts Float32 audio from microphone to Int16 PCM for Gemini Live API
 */
export const float32ToInt16PCM = (float32Array: Float32Array): ArrayBuffer => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp between -1 and 1
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    // Scale to 16-bit integer range
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array.buffer;
};

/**
 * Encodes ArrayBuffer to Base64 string for JSON transport
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Handles smooth playback of streaming audio chunks from Gemini Live
 */
export class LiveAudioPlayer {
  private context: AudioContext;
  private nextStartTime: number = 0;
  private queue: AudioBufferSourceNode[] = [];
  
  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  async playChunk(base64Audio: string) {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    const data = base64ToUint8Array(base64Audio);
    const sampleRate = 24000;
    const numChannels = 1;
    
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = this.context.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    // Schedule playback
    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }
    
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    
    this.queue.push(source);
    
    source.onended = () => {
      this.queue = this.queue.filter(s => s !== source);
    };
  }

  stop() {
    this.queue.forEach(source => source.stop());
    this.queue = [];
    this.nextStartTime = 0;
  }
}