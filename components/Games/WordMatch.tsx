import React, { useState, useEffect } from 'react';
import { generateGameData, generateWordIllustration } from '../../services/gemini';
import { RefreshCw, Star, X, Image as ImageIcon } from 'lucide-react';

const WordMatch: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<{id: string, text: string, type: 'start' | 'end', matchId: string, fullWord: string}[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [score, setScore] = useState(0);

  // Reward Modal State
  const [showReward, setShowReward] = useState(false);
  const [rewardData, setRewardData] = useState<{word: string, image: string | null} | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  const initGame = async () => {
    setLoading(true);
    setMatched([]);
    setScore(0);
    setSelected(null);
    setShowReward(false);
    try {
      const data = await generateGameData();
      const newPairs: any[] = [];
      data.pairs.forEach((p, i) => {
        const id = `pair-${i}`;
        newPairs.push({ id: `${id}-1`, text: p.part1, type: 'start', matchId: id, fullWord: p.fullWord });
        newPairs.push({ id: `${id}-2`, text: p.part2, type: 'end', matchId: id, fullWord: p.fullWord });
      });
      // Shuffle
      setPairs(newPairs.sort(() => Math.random() - 0.5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initGame();
  }, []);

  const handleCardClick = async (id: string, matchId: string) => {
    if (matched.includes(matchId)) return;
    
    if (!selected) {
      setSelected(id);
    } else {
      const first = pairs.find(p => p.id === selected);
      const second = pairs.find(p => p.id === id);
      
      if (first && second && first.matchId === second.matchId && first.id !== second.id) {
        // Match!
        const newMatched = [...matched, first.matchId];
        setMatched(newMatched);
        setScore(prev => prev + 100);
        setSelected(null);

        // Trigger Reward
        setRewardData({ word: first.fullWord, image: null });
        setShowReward(true);
        setLoadingImage(true);

        try {
           const imgBase64 = await generateWordIllustration(first.fullWord);
           if (imgBase64) {
             setRewardData({ word: first.fullWord, image: `data:image/png;base64,${imgBase64}` });
           }
        } catch (e) {
          console.error("Failed to generate reward image", e);
        } finally {
          setLoadingImage(false);
        }

      } else {
        // No match
        setSelected(null); // Reset immediately for snappy feel
      }
    }
  };

  return (
    <div className="p-6 bg-purple-50 rounded-3xl min-h-[500px] relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-purple-800">Tricky Word Match</h2>
        <div className="flex gap-4 items-center">
            <div className="bg-white px-4 py-2 rounded-full font-bold text-purple-600 shadow flex items-center gap-2">
                <Star className="text-yellow-400" fill="currentColor"/> {score}
            </div>
            <button onClick={initGame} className="p-2 bg-white rounded-full hover:bg-purple-100 text-purple-600 shadow">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
        </div>
      </div>

      {loading ? (
         <div className="flex justify-center items-center h-64">
           <div className="animate-bounce text-purple-400 font-bold text-xl">Loading Words...</div>
         </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {pairs.map((card) => {
            const isMatched = matched.includes(card.matchId);
            const isSelected = selected === card.id;

            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id, card.matchId)}
                disabled={isMatched}
                className={`
                  h-32 rounded-2xl text-2xl font-bold transition-all duration-300 transform
                  ${isMatched 
                    ? 'bg-green-100 text-green-600 scale-95 opacity-50' 
                    : isSelected 
                        ? 'bg-purple-600 text-white scale-105 shadow-xl ring-4 ring-purple-300' 
                        : 'bg-white text-slate-700 hover:shadow-lg hover:-translate-y-1 border-b-4 border-purple-200'
                   }
                `}
              >
                {card.text}
              </button>
            );
          })}
        </div>
      )}
      
      {!loading && matched.length === pairs.length / 2 && pairs.length > 0 && !showReward && (
         <div className="mt-8 text-center animate-bounce">
            <h3 className="text-3xl font-bold text-purple-600">Awesome Job! 🎉</h3>
         </div>
      )}

      {/* Reward Modal */}
      {showReward && rewardData && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-3xl animate-fade-in">
           <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full mx-4 relative transform animate-bounce-in">
              <button 
                onClick={() => setShowReward(false)} 
                className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200"
              >
                <X size={20} />
              </button>
              
              <div className="text-center">
                 <h3 className="text-3xl font-bold text-green-600 mb-2">Great Match!</h3>
                 <p className="text-2xl font-bold text-slate-800 mb-4 capitalize">{rewardData.word}</p>
                 
                 <div className="aspect-square bg-slate-50 rounded-2xl mb-4 overflow-hidden flex items-center justify-center border-2 border-slate-100">
                    {loadingImage ? (
                      <div className="flex flex-col items-center text-purple-400">
                        <RefreshCw className="animate-spin mb-2" />
                        <span className="text-sm font-bold">Drawing...</span>
                      </div>
                    ) : rewardData.image ? (
                      <img src={rewardData.image} alt={rewardData.word} className="w-full h-full object-contain animate-scale-in" />
                    ) : (
                      <ImageIcon className="text-slate-300" size={48} />
                    )}
                 </div>
                 
                 <button 
                   onClick={() => setShowReward(false)}
                   className="w-full py-3 bg-green-500 text-white font-bold rounded-xl shadow-lg hover:bg-green-600 transition"
                 >
                   Keep Playing
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default WordMatch;