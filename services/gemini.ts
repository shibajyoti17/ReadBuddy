import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to validate API key availability
const checkApiKey = () => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment variables.");
  }
};

/**
 * FEATURE 2: Hyper-Adaptive Story Generation
 * Generates a short story based on interests and difficulty, 
 * adapting to the child's specific history (missed words).
 */
export const generateStory = async (topic: string, difficulty: string, learnerProfile?: { missedWords: string[] }): Promise<{ title: string; content: string }> => {
  checkApiKey();
  
  let adaptiveInstructions = "";
  if (learnerProfile && learnerProfile.missedWords.length > 0) {
    const recentMisses = learnerProfile.missedWords.slice(0, 8).join(", ");
    adaptiveInstructions = `
    5. ADAPTIVE LEARNING: The child has previously struggled with these words: [${recentMisses}]. 
       Seamlessly weave 2-3 of these words (or similar rhyming words) into the story to provide natural practice.
       Highlight these practice words by making the story context around them fun.`;
  }

  const prompt = `Write a short, engaging story for a dyslexic child aged 7-12. 
  Topic: ${topic}. 
  Difficulty Level: ${difficulty}.
  
  Instructions:
  1. The story should be about 100-150 words.
  2. Use simple sentence structures.
  3. Include several "challenge words" for tricky letters like b/d, p/q, m/w.
  4. Keep the tone encouraging and fun.
  ${adaptiveInstructions}
  
  Return the response in JSON format with "title" and "content" fields.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
          },
          required: ["title", "content"],
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Story generation error:", error);
    throw error;
  }
};

/**
 * Generates an image using Imagen/Gemini Image model.
 */
export const generateImage = async (promptText: string): Promise<string | null> => {
  checkApiKey();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { 
            text: `A colorful, cheerful, children's book illustration style image. ${promptText}. High quality, cartoon style, isolated on white if possible.` 
          },
        ],
      },
    });

    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
           return part.inlineData.data;
        }
      }
    }
    return null;
  } catch (e) {
    console.error("Image generation error:", e);
    return null;
  }
};

/**
 * Wrapper for generateImage to keep backward compatibility or specific naming if needed
 */
export const generateWordIllustration = generateImage;


/**
 * Analyzes audio recording against the text (One-shot analysis).
 */
export const analyzeReading = async (text: string, audioBase64: string): Promise<{ score: number; feedback: string; mispronouncedWords: string[] }> => {
  checkApiKey();

  // We need to strip the data:audio/...;base64, prefix if present
  const base64Data = audioBase64.split(',')[1] || audioBase64;

  const prompt = `You are a supportive reading tutor for a child.
  The child is reading this text: "${text}".
  
  Analyze the attached audio recording of their reading.
  1. Identify any words they struggled with or mispronounced. Be lenient, they are children.
  2. Give a score from 1 to 5 stars (integer).
  3. Provide a 1-2 sentence encouraging feedback message. 
  
  Return JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "audio/wav", // Assuming WAV/WebM from MediaRecorder, Gemini is flexible
              data: base64Data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            feedback: { type: Type.STRING },
            mispronouncedWords: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No analysis result");

    return JSON.parse(resultText);
  } catch (error) {
    console.error("Analysis error:", error);
    // Fallback if audio fails or model is overloaded
    return {
      score: 3,
      feedback: "Great effort! I couldn't quite hear you clearly, but keep practicing!",
      mispronouncedWords: []
    };
  }
};

/**
 * FEATURE 1: Live Reading Companion
 * Manages the WebSockets connection to Gemini Live API.
 */
export class ReadBuddyLive {
  private currentSession: any = null;

  async connect(onAudioData: (base64: string) => void, storyContext: string) {
    checkApiKey();
    
    // System instruction to act as a tutor
    const systemInstruction = `You are ReadBuddy, a friendly, patient, and encouraging reading companion for a child. 
    The child is reading the following story aloud:
    "${storyContext}"
    
    Your goal is to listen. 
    - If they read correctly, you can occasionally give a brief "mhmm" or "good" but mostly stay quiet to let them read.
    - If they struggle, pause, or mispronounce a word significantly, kindly interrupt to help them sound it out or say the word correctly.
    - Be warm and supportive. Use a female voice.`;

    this.currentSession = await ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: systemInstruction,
      },
      callbacks: {
        onopen: () => {
          console.log("ReadBuddy Live Connected");
        },
        onmessage: (message: LiveServerMessage) => {
          // Extract audio from the model's turn
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            onAudioData(base64Audio);
          }
        },
        onclose: () => {
          console.log("ReadBuddy Live Closed");
        },
        onerror: (err) => {
          console.error("ReadBuddy Live Error", err);
        }
      }
    });
  }

  sendAudio(base64Audio: string) {
    if (this.currentSession) {
      this.currentSession.sendRealtimeInput({
        media: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Audio
        }
      });
    }
  }

  disconnect() {
    // There is no explicit disconnect method on the session object in the provided SDK types,
    // but typically we stop sending data. The session closes if the client disconnects.
    // In a real implementation, we might close the underlying socket if accessible.
    this.currentSession = null;
  }
}

/**
 * Breaks a word down into syllables and phonetics.
 */
export const breakDownWord = async (word: string): Promise<{ syllables: string[]; phonetics: string; simpleDefinition: string }> => {
  checkApiKey();
  
  const prompt = `Explain the word "${word}" for a 7-12 year old child.
  1. Break it into syllables (e.g., "el-e-phant").
  2. Provide simple phonetic pronunciation.
  3. Give a very simple definition.
  
  Return JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            syllables: { type: Type.ARRAY, items: { type: Type.STRING } },
            phonetics: { type: Type.STRING },
            simpleDefinition: { type: Type.STRING }
          }
        }
      }
    });
    
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Word breakdown error:", error);
    return { syllables: [word], phonetics: word, simpleDefinition: "A word." };
  }
};

/**
 * Generate game data (syllable matching).
 */
export const generateGameData = async (): Promise<{ pairs: { part1: string, part2: string, fullWord: string }[] }> => {
    checkApiKey();
    const prompt = `Create 5 two-syllable words suitable for 3rd graders that are good for practicing dyslexia challenges.
    Focus on words containing tricky letters like b, d, p, q, m, w.
    Return a JSON object with a list of items, where each item has "part1" (first syllable), "part2" (second syllable), and "fullWord".`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        pairs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    part1: { type: Type.STRING },
                                    part2: { type: Type.STRING },
                                    fullWord: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });
        return JSON.parse(response.text || '{ "pairs": [] }');
    } catch (e) {
        return { pairs: [] };
    }
}

/**
 * Get a list of words focusing on specific tricky letters.
 */
export const getTrickyWords = async (category: string): Promise<string[]> => {
  checkApiKey();
  const prompt = `Generate a list of 5 distinct, simple concrete nouns that represent physical objects or animals, suitable for children. 
  These words must contain the letters from this category: "${category}". 
  For example, if the category is "b vs d", include words like "bed", "dog", "ball", "dad".
  Return a JSON array of strings.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             words: {
               type: Type.ARRAY,
               items: { type: Type.STRING }
             }
          }
        }
      }
    });
    const parsed = JSON.parse(response.text || '{"words": []}');
    return parsed.words || [];
  } catch (e) {
    console.error("Tricky words error", e);
    return ["bed", "dad", "dog", "ball", "bird"]; // Fallback
  }
}

/**
 * Generates speech from text using Gemini TTS.
 * Uses 'Kore' voice for a human, female-like tone.
 */
export const speakText = async (text: string): Promise<string | null> => {
  checkApiKey();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }] 
      },
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is a warm female voice
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
      return audioPart.inlineData.data;
    }
    return null;
  } catch (e) {
    console.error("TTS Error:", e);
    return null;
  }
};