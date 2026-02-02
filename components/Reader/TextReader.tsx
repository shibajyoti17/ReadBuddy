import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, FontType } from '../../types';
import { Play, Mic, Square, Volume2, Highlighter, HelpCircle, X, Image as ImageIcon, RefreshCw, Zap, Sparkles, ArrowLeft } from 'lucide-react';
import { startRecording, stopRecording, blobToBase64, playPCMAudio, LiveAudioPlayer, float32ToInt16PCM, arrayBufferToBase64 } from '../../utils/audioUtils';
import { analyzeReading, breakDownWord, generateWordIllustration, speakText, ReadBuddyLive } from '../../services/gemini';

interface TextReaderProps {
  title: string;
  content: string;
  settings: UserSettings;
  onSessionComplete: (stats: { score: number, words: number, missedWords?: string[] }) => void;
  onClose: () => void;
}

const TextReader: React.FC<TextReaderProps> = ({ title, content, settings, onSessionComplete, onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [feedback, setFeedback] = useState<{ score: number; text: string, missed: string[] } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedWord, setSelectedWord] = useState<{ word: string; syllables: string[]; phonetics: string; def: string, image?: string } | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);
  const [readingLoading, setReadingLoading] = useState(false);
  
  // LIVE MODE STATE
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveSession, setLiveSession] = useState<ReadBuddyLive | null>(null);
  const liveAudioPlayer = useRef<LiveAudioPlayer | null>(null);
  const inputAudioContext = useRef<AudioContext | null>(null);
  const processorNode = useRef<ScriptProcessorNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);

  // Styling based on settings
  const containerStyle = {
    fontFamily: settings.font === FontType.LEXEND ? '"Lexend", sans-serif' : 
                  settings.font === FontType.COMIC ? '"Comic Neue", cursive' : 
                  '"Open Sans", sans-serif',
    fontSize: `${1 + (settings.fontSize * 0.2)}rem`,
    letterSpacing: `${settings.letterSpacing * 0.05}em`,
    lineHeight: `${1.5 + (settings.lineHeight * 0.3)}`,
  };

  useEffect(() => {
    return () => {
      // Cleanup Live Session on unmount
      stopLiveSession();
    };
  }, []);

  const handleWordClick = async (word: string) => {
    // Remove punctuation
    const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    if (!cleanWord) return;

    setLoadingWord(true);
    setSelectedWord(null);
    try {
      // Fetch definitions, image, and speech in parallel for speed
      const [breakdown, imageBase64, audioBase64] = await Promise.all([
        breakDownWord(cleanWord),
        generateWordIllustration(cleanWord),
        speakText(cleanWord) // Fetch Gemini voice for the word
      ]);

      setSelectedWord({
        word: cleanWord,
        syllables: breakdown.syllables,
        phonetics: breakdown.phonetics,
        def: breakdown.simpleDefinition,
        image: imageBase64 ? `data:image/png;base64,${imageBase64}` : undefined
      });
      
      // Play the Gemini audio if available
      if (audioBase64) {
        await playPCMAudio(audioBase64);
      } else {
         // Fallback to browser if Gemini fails
         const utterance = new SpeechSynthesisUtterance(cleanWord);
         window.speechSynthesis.speak(utterance);
      }
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWord(false);
    }
  };

  const handleToggleRecord = async () => {
    if (isLiveMode) {
      // Handle Live Mode Toggle
      if (isRecording) {
        stopLiveSession();
        setIsRecording(false);
      } else {
        await startLiveSession();
        setIsRecording(true);
      }
    } else {
      // Handle Standard Mode Toggle
      if (isRecording) {
        if (mediaRecorder) {
          setIsProcessing(true);
          const audioBlob = await stopRecording(mediaRecorder);
          const base64 = await blobToBase64(audioBlob);
          
          try {
            const result = await analyzeReading(content, base64);
            setFeedback({
              score: result.score,
              text: result.feedback,
              missed: result.mispronouncedWords || []
            });
            onSessionComplete({ 
              score: result.score, 
              words: content.split(' ').length,
              missedWords: result.mispronouncedWords
            });
          } catch (e) {
            console.error("Analysis failed", e);
            setFeedback({ score: 0, text: "Oops, something went wrong. Try again!", missed: [] });
          } finally {
            setIsProcessing(false);
          }
        }
        setIsRecording(false);
        setMediaRecorder(null);
      } else {
        setFeedback(null);
        try {
          const recorder = await startRecording();
          setMediaRecorder(recorder);
          setIsRecording(true);
        } catch (e) {
          alert("Microphone access denied. Please enable microphone permissions.");
        }
      }
    }
  };

  // --- LIVE SESSION LOGIC ---
  const startLiveSession = async () => {
    try {
      if (!liveAudioPlayer.current) {
        liveAudioPlayer.current = new LiveAudioPlayer();
      }

      const session = new ReadBuddyLive();
      await session.connect((base64Audio) => {
        liveAudioPlayer.current?.playChunk(base64Audio);
      }, content);
      
      setLiveSession(session);

      // Start Microphone Stream
      micStream.current = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1
      }});

      inputAudioContext.current = new window.AudioContext({ sampleRate: 16000 });
      const source = inputAudioContext.current.createMediaStreamSource(micStream.current);
      
      // Use ScriptProcessor for streaming audio processing (simple hackathon approach)
      // Buffer size 4096 gives decent latency/performance balance
      processorNode.current = inputAudioContext.current.createScriptProcessor(4096, 1, 1);
      
      processorNode.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert to PCM 16-bit
        const pcmBuffer = float32ToInt16PCM(inputData);
        const base64 = arrayBufferToBase64(pcmBuffer);
        session.sendAudio(base64);
      };

      source.connect(processorNode.current);
      processorNode.current.connect(inputAudioContext.current.destination);

    } catch (e) {
      console.error("Failed to start Live Session", e);
      alert("Could not start Live Tutor. Check permissions.");
      setIsRecording(false);
    }
  };

  const stopLiveSession = () => {
    if (liveSession) {
      liveSession.disconnect();
      setLiveSession(null);
    }
    if (processorNode.current) {
      processorNode.current.disconnect();
      processorNode.current = null;
    }
    if (inputAudioContext.current) {
      inputAudioContext.current.close();
      inputAudioContext.current = null;
    }
    if (micStream.current) {
      micStream.current.getTracks().forEach(t => t.stop());
      micStream.current = null;
    }
    if (liveAudioPlayer.current) {
      liveAudioPlayer.current.stop();
    }
  };


  const handleReadAloud = async () => {
    setReadingLoading(true);
    try {
       const audioBase64 = await speakText(content);
       if (audioBase64) {
         await playPCMAudio(audioBase64);
       } else {
         const utterance = new SpeechSynthesisUtterance(content);
         window.speechSynthesis.speak(utterance);
       }
    } catch (e) {
       console.error("Read aloud error", e);
    } finally {
       setReadingLoading(false);
    }
  };

  // Process content into clickable spans
  const renderContent = () => {
    return content.split(' ').map((word, index) => {
      // Check if word is in missed list to highlight
      const isMissed = feedback?.missed.some(m => word.toLowerCase().includes(m.toLowerCase()));
      
      return (
        <span 
          key={index} 
          onClick={() => handleWordClick(word)}
          className={`
            inline-block mr-2 cursor-pointer rounded px-1 transition-colors duration-200
            ${isMissed ? 'bg-red-200 text-red-800' : 'hover:bg-blue-100'}
            ${settings.highContrast ? 'hover:bg-yellow-300 text-black' : ''}
          `}
        >
          {word}
        </span>
      );
    });
  };

  return (
    <div className={`fixed inset-0 z-40 flex flex-col bg-white ${settings.highContrast ? 'bg-black text-white' : 'bg-slate-50'}`}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-white shadow-sm z-50">
        <div className="flex items-center gap-3">
           <button 
             onClick={onClose} 
             className="p-2 hover:bg-slate-100 rounded-full mr-2 text-slate-500 hover:text-slate-800 transition"
             aria-label="Back to Dashboard"
           >
             <ArrowLeft size={24} />
           </button>
           
           <h2 className="text-xl font-bold text-slate-800 hidden md:block">{title}</h2>
           
           {/* Mode Toggle */}
           <div className="bg-slate-100 p-1 rounded-lg flex items-center">
              <button 
                onClick={() => { setIsLiveMode(false); if(isRecording) stopLiveSession(); setIsRecording(false); }}
                className={`px-3 py-1 rounded-md text-sm font-bold transition ${!isLiveMode ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}
              >
                Standard
              </button>
              <button 
                onClick={() => { setIsLiveMode(true); setFeedback(null); }}
                className={`px-3 py-1 rounded-md text-sm font-bold transition flex items-center gap-1 ${isLiveMode ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow' : 'text-slate-400'}`}
              >
                <Sparkles size={12}/> Live Tutor
              </button>
           </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex relative">
        {/* Main Text Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 relative">
          
          {/* Reading Ruler Overlay */}
          {settings.readingRuler && (
            <div className="pointer-events-none fixed left-0 right-0 h-16 bg-yellow-200/20 border-t-2 border-b-2 border-yellow-400 mix-blend-multiply top-1/2 -translate-y-1/2 z-0" />
          )}

          <div style={containerStyle} className={`max-w-3xl mx-auto ${settings.highContrast ? 'text-white' : 'text-slate-800'}`}>
            {renderContent()}
          </div>
        </div>

        {/* Word Detail Sidebar */}
        {(selectedWord || loadingWord) && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l shadow-xl p-6 z-20 flex flex-col gap-4 animate-slide-in-right overflow-y-auto">
            <div className="flex justify-between">
               <h3 className="font-bold text-lg text-slate-500">Word Buddy</h3>
               <button onClick={() => setSelectedWord(null)}><X size={20}/></button>
            </div>
            
            {loadingWord ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                <span className="text-slate-400 font-bold">Asking Gemini...</span>
              </div>
            ) : selectedWord && (
              <>
                <div className="text-4xl font-bold text-center text-blue-600 my-4 capitalize">{selectedWord.word}</div>
                <div className="bg-slate-50 rounded-xl overflow-hidden border-2 border-slate-100 min-h-[150px] flex items-center justify-center">
                   {selectedWord.image ? (
                     <img src={selectedWord.image} alt={selectedWord.word} className="w-full h-auto object-contain" />
                   ) : (
                     <div className="flex flex-col items-center text-slate-300">
                        <ImageIcon size={32} />
                        <span className="text-xs mt-1">No image</span>
                     </div>
                   )}
                </div>
                <div className="bg-blue-50 p-4 rounded-xl">
                  <p className="text-sm text-blue-400 font-bold uppercase tracking-wider mb-1">Syllables</p>
                  <div className="flex gap-2 justify-center">
                    {selectedWord.syllables.map((s, i) => (
                      <span key={i} className="px-3 py-1 bg-white rounded shadow-sm text-lg font-medium">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl">
                  <p className="text-sm text-green-600 font-bold uppercase tracking-wider mb-1">Sounds Like</p>
                  <p className="text-xl text-slate-700 text-center font-mono">/{selectedWord.phonetics}/</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className={`p-4 border-t ${settings.highContrast ? 'bg-gray-900 border-gray-700' : 'bg-white'} flex flex-col md:flex-row gap-4 items-center justify-between`}>
         <div className="flex gap-4">
            <button 
              onClick={handleReadAloud}
              disabled={readingLoading || isLiveMode}
              className="flex items-center gap-2 px-6 py-3 bg-blue-100 text-blue-700 rounded-full font-bold hover:bg-blue-200 transition disabled:opacity-50"
            >
              {readingLoading ? <RefreshCw className="animate-spin" size={20} /> : <Volume2 size={20} />}
              {readingLoading ? 'Loading...' : 'Read to Me'}
            </button>
         </div>

         {/* Visual Feedback Area */}
         <div className="flex items-center gap-4">
            {isLiveMode && isRecording && (
               <div className="flex items-center gap-2 text-purple-600 animate-pulse font-bold bg-purple-50 px-4 py-2 rounded-xl">
                  <Zap size={20} fill="currentColor"/>
                  Live Buddy Listening...
               </div>
            )}
            
            {feedback && !isRecording && !isLiveMode && (
              <div className="bg-white border-2 border-blue-100 rounded-2xl px-6 py-2 flex items-center gap-3 animate-fade-in">
                 <div className="flex text-yellow-400 text-xl">
                   {'★'.repeat(feedback.score)}{'☆'.repeat(5 - feedback.score)}
                 </div>
                 <p className="text-sm font-medium text-slate-600">{feedback.text}</p>
              </div>
            )}
         </div>

         <div className="flex gap-4">
            <button 
              onClick={handleToggleRecord}
              disabled={isProcessing}
              className={`
                flex items-center gap-2 px-8 py-3 rounded-full font-bold text-white shadow-lg transition-all transform hover:scale-105
                ${isRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                  : isLiveMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-500 hover:bg-green-600'}
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isProcessing ? (
                <>Analyzing...</>
              ) : isRecording ? (
                <><Square size={20} fill="currentColor" /> Stop</>
              ) : isLiveMode ? (
                <><Mic size={20} /> Start Live Session</>
              ) : (
                <><Mic size={20} /> Start Recording</>
              )}
            </button>
         </div>
      </div>
    </div>
  );
};

export default TextReader;