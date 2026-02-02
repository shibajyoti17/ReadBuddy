import React, { useState, useEffect } from 'react';
import { getTrickyWords, generateWordIllustration, analyzeReading, speakText } from '../../services/gemini';
import { Mic, Square, Volume2, ArrowRight, RefreshCw, Image as ImageIcon, CheckCircle, XCircle } from 'lucide-react';
import { startRecording, stopRecording, blobToBase64, playPCMAudio } from '../../utils/audioUtils';

const CATEGORIES = [
  // Visual Confusions (Mirror images & Rotations)
  { id: 'b_d', label: 'b vs d', letters: 'b and d' },
  { id: 'p_q', label: 'p vs q', letters: 'p and q' },
  { id: 'm_w', label: 'm vs w', letters: 'm and w' },
  { id: 'n_u', label: 'n vs u', letters: 'n and u' },
  { id: 'i_j', label: 'i vs j', letters: 'i and j' },
  
  // Auditory/Phonetic Confusions (Similar sounds)
  { id: 'f_v', label: 'f vs v', letters: 'f and v' },
  { id: 'm_n', label: 'm vs n', letters: 'm and n' },
  { id: 'd_t', label: 'd vs t', letters: 'd and t' },
  { id: 's_z', label: 's vs z', letters: 's and z' },
  { id: 'g_k', label: 'g vs k', letters: 'g and k' },
  
  // Digraphs & Common Substitutions
  { id: 'ch_sh', label: 'ch vs sh', letters: 'ch and sh' },
  { id: 'th_f', label: 'th vs f', letters: 'th and f' },
];

const PhonemePractice: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; message: string } | null>(null);

  const startPractice = async (categoryId: string) => {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return;

    setSelectedCategory(categoryId);
    setLoading(true);
    setWords([]);
    setCurrentIndex(0);
    setResult(null);
    setCurrentImage(null);

    try {
      const fetchedWords = await getTrickyWords(cat.letters);
      setWords(fetchedWords);
      if (fetchedWords.length > 0) {
        loadImageForWord(fetchedWords[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadImageForWord = async (word: string) => {
    setImageLoading(true);
    setCurrentImage(null);
    try {
      const base64 = await generateWordIllustration(word);
      if (base64) {
        setCurrentImage(`data:image/png;base64,${base64}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setImageLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setResult(null);
      loadImageForWord(words[nextIndex]);
    } else {
      // Finished
      setSelectedCategory(null);
    }
  };

  const toggleRecording = async () => {
    if (isRecording && mediaRecorder) {
       setIsRecording(false);
       setIsAnalyzing(true);
       try {
         const blob = await stopRecording(mediaRecorder);
         const base64 = await blobToBase64(blob);
         
         // Use the existing analyzeReading function but focused on the single word
         const currentWord = words[currentIndex];
         const response = await analyzeReading(currentWord, base64);
         
         const isCorrect = response.score >= 4 || (response.mispronouncedWords && !response.mispronouncedWords.includes(currentWord));
         
         setResult({
           correct: isCorrect,
           message: response.feedback
         });

       } catch (e) {
         console.error(e);
         setResult({ correct: false, message: "Couldn't hear you. Try again!" });
       } finally {
         setIsAnalyzing(false);
         setMediaRecorder(null);
       }
    } else {
       setResult(null);
       try {
         const recorder = await startRecording();
         setMediaRecorder(recorder);
         setIsRecording(true);
       } catch (e) {
         alert("Microphone access required.");
       }
    }
  };

  const playWord = async () => {
    if (words[currentIndex] && !audioPlaying) {
      setAudioPlaying(true);
      try {
        const audioBase64 = await speakText(words[currentIndex]);
        if (audioBase64) {
          await playPCMAudio(audioBase64);
        } else {
           const u = new SpeechSynthesisUtterance(words[currentIndex]);
           window.speechSynthesis.speak(u);
        }
      } catch (e) {
         console.error(e);
      } finally {
        setAudioPlaying(false);
      }
    }
  };

  // 1. Selection Screen
  if (!selectedCategory) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-10">
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl p-8 text-white shadow-lg text-center">
          <h1 className="text-3xl font-bold font-comic mb-2">Tricky Letters Practice</h1>
          <p className="opacity-90">Pick a letter pair to practice with pictures!</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => startPractice(cat.id)}
              disabled={loading}
              className="bg-white p-6 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-purple-400 hover:shadow-md transition group text-left flex flex-col h-full"
            >
              <div className="flex justify-between items-center mb-2">
                 <h3 className="text-2xl font-bold text-slate-800 group-hover:text-purple-600 font-lexend">{cat.label}</h3>
                 <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition">
                   {loading && selectedCategory === cat.id ? <RefreshCw className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                 </div>
              </div>
              <p className="text-slate-500 text-sm">Practice words with {cat.letters}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 2. Practice Screen
  const currentWord = words[currentIndex];

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-10">
      <div className="mb-6 flex items-center justify-between">
         <button onClick={() => setSelectedCategory(null)} className="text-slate-500 hover:text-slate-800 font-bold">
           &larr; Back to Menu
         </button>
         <div className="text-slate-400 font-bold">
           Word {currentIndex + 1} of {words.length}
         </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
         {/* Image Area */}
         <div className="aspect-video bg-slate-50 flex items-center justify-center border-b border-slate-100 relative">
            {imageLoading ? (
               <div className="flex flex-col items-center gap-2">
                 <RefreshCw className="animate-spin text-purple-400 w-8 h-8" />
                 <span className="text-slate-400 font-bold text-sm">Drawing picture...</span>
               </div>
            ) : currentImage ? (
               <img src={currentImage} alt={currentWord} className="w-full h-full object-contain p-4 animate-scale-in" />
            ) : (
               <div className="flex flex-col items-center gap-2 text-slate-300">
                  <ImageIcon size={48} />
                  <span>No image available</span>
               </div>
            )}
         </div>

         {/* Interaction Area */}
         <div className="p-8 text-center space-y-8">
            <div>
               <h2 className="text-6xl font-bold text-slate-800 font-lexend tracking-wide mb-4">{currentWord}</h2>
               <button 
                 onClick={playWord}
                 disabled={audioPlaying}
                 className="inline-flex items-center gap-2 text-purple-600 font-bold bg-purple-50 px-4 py-2 rounded-full hover:bg-purple-100 transition disabled:opacity-50"
               >
                 {audioPlaying ? <RefreshCw className="animate-spin" size={18}/> : <Volume2 size={18} />} 
                 {audioPlaying ? 'Loading...' : 'Listen'}
               </button>
            </div>

            <div className="flex justify-center gap-4">
              <button 
                 onClick={toggleRecording}
                 disabled={isAnalyzing}
                 className={`
                   w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all transform hover:scale-105
                   ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}
                   ${isAnalyzing ? 'opacity-50 cursor-wait' : ''}
                 `}
              >
                 {isAnalyzing ? (
                   <RefreshCw className="animate-spin text-white w-8 h-8" />
                 ) : isRecording ? (
                   <Square className="text-white w-8 h-8" fill="currentColor" />
                 ) : (
                   <Mic className="text-white w-8 h-8" />
                 )}
              </button>
            </div>

            {/* Feedback */}
            {result && (
              <div className={`p-4 rounded-xl animate-bounce-in ${result.correct ? 'bg-green-50 border border-green-100' : 'bg-orange-50 border border-orange-100'}`}>
                 <div className="flex items-center justify-center gap-2 mb-1">
                   {result.correct ? <CheckCircle className="text-green-500" /> : <XCircle className="text-orange-500" />}
                   <span className={`font-bold text-lg ${result.correct ? 'text-green-700' : 'text-orange-700'}`}>
                     {result.correct ? 'Excellent!' : 'Keep Trying!'}
                   </span>
                 </div>
                 <p className="text-slate-600">{result.message}</p>
                 
                 {result.correct && (
                   <button 
                     onClick={handleNext}
                     className="mt-4 px-6 py-2 bg-green-500 text-white font-bold rounded-full shadow-md hover:bg-green-600 transition"
                   >
                     Next Word &rarr;
                   </button>
                 )}
              </div>
            )}
            
            <p className="text-slate-400 text-sm">
              Tap the microphone and read the word aloud!
            </p>
         </div>
      </div>
    </div>
  );
};

export default PhonemePractice;