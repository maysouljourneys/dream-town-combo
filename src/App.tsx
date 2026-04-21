import { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  LayoutGrid, 
  Zap, 
  Plus, 
  X, 
  CheckCircle2, 
  Map as MapIcon,
  HelpCircle,
  Package,
  Heart,
  Layers,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { COMBOS, type Combo } from "./data";
import { cn } from "./lib/utils";

type AppMode = "all" | "planner" | "discovery";

export default function App() {
  const [search, setSearch] = useState("");
  const [appMode, setAppMode] = useState<AppMode>("discovery");
  const [selectedStructures, setSelectedStructures] = useState<string[]>(() => {
    const saved = localStorage.getItem("dream-town-structures");
    return saved ? JSON.parse(saved) : [];
  });
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem("dream-town-favorites");
    return saved ? JSON.parse(saved) : [];
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem("dream-town-favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("dream-town-structures", JSON.stringify(selectedStructures));
  }, [selectedStructures]);

  // Derived data
  const allStructures = useMemo(() => {
    const set = new Set<string>();
    COMBOS.forEach(c => c.structures.forEach(s => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, []);

  const activeCombos = useMemo(() => {
    return COMBOS.filter(combo => 
      combo.structures.every(s => selectedStructures.includes(s))
    ).filter(c => !showFavoritesOnly || favorites.includes(c.id));
  }, [selectedStructures, showFavoritesOnly, favorites]);

  // Synergistic Grouping Logic (Refined for max 3 combos per group)
  const synergisticGroups = useMemo(() => {
    if (activeCombos.length < 2) return [];

    const pairs: { combos: Combo[], saved: number, buildings: Set<string> }[] = [];
    const triplets: { combos: Combo[], saved: number, buildings: Set<string> }[] = [];

    const getOverlap = (c1: Combo, c2: Combo) => {
      const set1 = new Set(c1.structures);
      return c2.structures.filter(s => set1.has(s)).length;
    };

    // Find all pairs
    for (let i = 0; i < activeCombos.length; i++) {
      for (let j = i + 1; j < activeCombos.length; j++) {
        const overlap = getOverlap(activeCombos[i], activeCombos[j]);
        if (overlap > 0) {
          const buildings = new Set([...activeCombos[i].structures, ...activeCombos[j].structures]);
          pairs.push({
            combos: [activeCombos[i], activeCombos[j]],
            saved: overlap,
            buildings
          });
        }
      }
    }

    // Find triplets based on pairs
    for (let i = 0; i < activeCombos.length; i++) {
      for (let j = i + 1; j < activeCombos.length; j++) {
        for (let k = j + 1; k < activeCombos.length; k++) {
          const c1 = activeCombos[i];
          const c2 = activeCombos[j];
          const c3 = activeCombos[k];
          
          const overlap12 = getOverlap(c1, c2);
          const overlap23 = getOverlap(c2, c3);
          const overlap13 = getOverlap(c1, c3);

          if ((overlap12 > 0 && overlap23 > 0) || (overlap12 > 0 && overlap13 > 0) || (overlap23 > 0 && overlap13 > 0)) {
            const uniqueBuildings = new Set([...c1.structures, ...c2.structures, ...c3.structures]);
            const totalStructures = c1.structures.length + c2.structures.length + c3.structures.length;
            const saved = totalStructures - uniqueBuildings.size;
            
            triplets.push({
              combos: [c1, c2, c3],
              saved,
              buildings: uniqueBuildings
            });
          }
        }
      }
    }

    // Combine and sort by "Efficiency": saved buildings (primary) and unique building count (secondary)
    // We want maximum overlap with minimum unique buildings
    const candidates = [...triplets, ...pairs].sort((a, b) => {
      if (b.saved !== a.saved) return b.saved - a.saved;
      return a.buildings.size - b.buildings.size;
    });

    // Diverse selection: ensure we don't just show slight variations of the same combos
    const groups: Combo[][] = [];
    const usedComboUsageCount: Record<string, number> = {};
    const usedGroupKeys = new Set<string>();

    for (const cand of candidates) {
      if (groups.length >= 6) break;

      const comboKey = cand.combos.map(c => c.id).sort().join("|");
      if (usedGroupKeys.has(comboKey)) continue;

      // Check if this group is essentially a subset or very similar to an existing one
      let isTooSimilar = false;
      for (const existingGroup of groups) {
        const existingIds = existingGroup.map(c => c.id);
        const intersection = cand.combos.filter(c => existingIds.includes(c.id));
        
        // If they share most of their combos, it's not diverse enough
        if (intersection.length >= Math.min(cand.combos.length, existingGroup.length) - (cand.combos.length > 2 ? 1 : 0)) {
           // For triplets, if they share 2, they are basically the same cluster idea.
           if (cand.combos.length > 2 && intersection.length >= 2) {
             isTooSimilar = true;
             break;
           }
           if (cand.combos.length === 2 && intersection.length >= 1) {
             // For pairs, we only skip if the combo that is reused has already been used many times.
             if (intersection.every(c => (usedComboUsageCount[c.id] || 0) >= 2)) {
               isTooSimilar = true;
               break;
             }
           }
        }
      }

      if (isTooSimilar) continue;

      // Ensure every combo in the group isn't already "over-used"
      const totalUsageOfMemberCombos = cand.combos.reduce((acc, c) => acc + (usedComboUsageCount[c.id] || 0), 0);
      if (totalUsageOfMemberCombos > cand.combos.length) { 
        continue;
      }

      groups.push(cand.combos);
      usedGroupKeys.add(comboKey);
      cand.combos.forEach(c => {
        usedComboUsageCount[c.id] = (usedComboUsageCount[c.id] || 0) + 1;
      });
    }

    // Second pass for filling up to 4 groups if diversity was too strict
    if (groups.length < 4) {
      for (const cand of candidates) {
        if (groups.length >= 4) break;
        const comboKey = cand.combos.map(c => c.id).sort().join("|");
        if (usedGroupKeys.has(comboKey)) continue;

        // Looser subset check
        const isSubset = groups.some(existingGroup => 
          cand.combos.every(c => existingGroup.some(ec => ec.id === c.id))
        );
        if (isSubset) continue;

        groups.push(cand.combos);
        usedGroupKeys.add(comboKey);
      }
    }

    return groups;
  }, [activeCombos]);

  const potentialCombos = useMemo(() => {
    return COMBOS.filter(combo => {
      const hasSome = combo.structures.some(s => selectedStructures.includes(s));
      const hasAll = combo.structures.every(s => selectedStructures.includes(s));
      return hasSome && !hasAll;
    }).filter(c => !showFavoritesOnly || favorites.includes(c.id));
  }, [selectedStructures, showFavoritesOnly, favorites]);

  const filteredCombos = useMemo(() => {
    return COMBOS.filter((combo) => {
      const query = search.toLowerCase();
      const matchesSearch = 
        combo.name.toLowerCase().includes(query) ||
        combo.structures.some(s => s.toLowerCase().includes(query));
      const matchesFavorite = !showFavoritesOnly || favorites.includes(combo.id);
      return matchesSearch && matchesFavorite;
    }).sort((a, b) => {
      const aMatches = a.structures.filter(s => selectedStructures.includes(s)).length;
      const bMatches = b.structures.filter(s => selectedStructures.includes(s)).length;
      
      // If one has all matches and the other doesn't, put all matches late (they are "formed")
      // OR maybe the user wants formed first? 
      // "most potential to form first" usually implies those closest to completion but not yet complete?
      // Actually usually "Formed" is the highest potential (100%).
      // Let's sort by matches count descending.
      if (bMatches !== aMatches) return bMatches - aMatches;
      return a.name.localeCompare(b.name);
    });
  }, [search, showFavoritesOnly, favorites, selectedStructures]);

  // Discovery / Prediction Logic
  const predictions = useMemo(() => {
    const remainingStructures = allStructures.filter(s => !selectedStructures.includes(s));
    
    // 1. Calculate value of each building
    const buildingValueMap = remainingStructures.map(s => {
      let weight = 0;
      const helpsWith: Combo[] = [];
      
      COMBOS.forEach(combo => {
        const hasCount = combo.structures.filter(bs => selectedStructures.includes(bs)).length;
        if (combo.structures.includes(s)) {
          // If building s completes a combo
          if (hasCount === combo.structures.length - 1) {
            weight += 10;
            helpsWith.push(combo);
          } 
          // If it moves it to 1-away
          else if (hasCount === combo.structures.length - 2) {
            weight += 3;
            helpsWith.push(combo);
          }
          // General help
          else {
            weight += 1;
          }
        }
      });
      
      return { 
        name: s, 
        weight, 
        helpsWith: helpsWith.sort((a, b) => a.name.localeCompare(b.name)) 
      };
    });

    const topRecommendations = buildingValueMap
      .filter(p => p.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);

    // 2. High Probability Combos (Almost complete)
    const hotCombos = potentialCombos
      .map(c => {
        const missing = c.structures.filter(s => !selectedStructures.includes(s));
        return { ...c, missing };
      })
      .sort((a, b) => a.missing.length - b.missing.length || b.structures.length - a.structures.length)
      .slice(0, 10);

    return { topRecommendations, hotCombos };
  }, [selectedStructures, allStructures, potentialCombos]);

  const toggleStructure = (s: string) => {
    setSelectedStructures(prev => 
      prev.includes(s) ? prev.filter(item => item !== s) : [...prev, s]
    );
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-[#FDFCF6] text-[#2D2D2D] font-sans selection:bg-[#FFD93D] selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FDFCF6]/90 backdrop-blur-md border-b border-[#E5E1D1] px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-[#FFD93D] rounded-xl flex items-center justify-center border border-[#E5E1D1] shadow-sm">
              <Zap className="w-6 h-6 text-[#2D2D2D]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dream Town Finder</h1>
              <p className="text-[10px] text-[#8B866D] font-bold uppercase tracking-[0.2em]">Standard Combo List</p>
            </div>
          </div>

          <div className="flex items-center gap-4 lg:flex-1 justify-center lg:justify-start">
            <div className="flex bg-[#EFEBD8] p-1 rounded-xl">
              <button
                onClick={() => setAppMode("discovery")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  appMode === "discovery" ? "bg-white shadow-sm text-[#2D2D2D]" : "text-[#8B866D] hover:text-[#2D2D2D]"
                )}
              >
                <Sparkles className="w-4 h-4" /> Discovery
              </button>
              <button
                onClick={() => setAppMode("planner")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  appMode === "planner" ? "bg-white shadow-sm text-[#2D2D2D]" : "text-[#8B866D] hover:text-[#2D2D2D]"
                )}
              >
                <MapIcon className="w-4 h-4" /> Planner
              </button>
              <button
                onClick={() => setAppMode("all")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  appMode === "all" ? "bg-white shadow-sm text-[#2D2D2D]" : "text-[#8B866D] hover:text-[#2D2D2D]"
                )}
              >
                <LayoutGrid className="w-4 h-4" /> All
              </button>
            </div>

            <button 
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border",
                showFavoritesOnly 
                  ? "bg-red-50 border-red-200 text-red-600 shadow-sm" 
                  : "bg-white border-[#E5E1D1] text-[#8B866D] hover:text-red-500 hover:border-red-100"
              )}
            >
              <Heart className={cn("w-4 h-4", showFavoritesOnly && "fill-current")} />
              {showFavoritesOnly ? "Favorites Only" : "All Combos"}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-sm w-full relative">
            <Search className="absolute left-3 w-4 h-4 text-[#8B866D]" />
            <input
              type="text"
              placeholder={appMode === "planner" ? "Filter buildings..." : "Search combinations..."}
              className="w-full bg-[#EFEBD8] border-transparent focus:bg-white focus:ring-2 focus:ring-[#FFD93D] focus:border-transparent rounded-lg py-2 pl-10 pr-4 text-sm transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:px-8">
        {appMode === "discovery" ? (
          /* Discovery Mode: Predictive Tools */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              {/* Structure Selection Sidebar (Shared) */}
              <div className="bg-white rounded-2xl border border-[#E5E1D1] p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold flex items-center gap-2">
                    <Plus className="w-5 h-5 text-amber-500" />
                    Discovery Seeds
                  </h2>
                </div>
                <p className="text-[11px] text-[#8B866D] mb-4 font-medium leading-relaxed">
                  Start picking buildings to see what's possible. We'll suggest the best next steps.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 min-h-[4rem] items-start p-3 bg-[#FDFCF6] rounded-xl border border-dashed border-[#D1CCB6]">
                    {selectedStructures.length === 0 && (
                      <p className="text-[11px] text-[#A6A189] italic font-medium">Pick a few starting buildings...</p>
                    )}
                    {selectedStructures.map(s => (
                      <button 
                        key={s}
                        onClick={() => toggleStructure(s)}
                        className="bg-white border border-amber-200 pl-2 pr-1.5 py-0.5 rounded-md text-[11px] font-black flex items-center gap-1 group hover:border-red-400 hover:bg-red-50 transition-all text-amber-900 shadow-sm"
                      >
                        {s}
                        <X className="w-3 h-3 text-amber-400 group-hover:text-red-500" />
                      </button>
                    ))}
                  </div>

                  <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-1 gap-1">
                      {allStructures
                        .filter(s => s.toLowerCase().includes(search.toLowerCase()))
                        .map(s => (
                        <button
                          key={s}
                          onClick={() => toggleStructure(s)}
                          className={cn(
                            "w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between group",
                            selectedStructures.includes(s)
                              ? "bg-[#2D2D2D] text-white"
                              : "bg-[#EFEBD8] text-[#5D5948] hover:bg-[#E5E1D1]"
                          )}
                        >
                          {s}
                          {selectedStructures.includes(s) && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#FFD93D]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-8">
              {/* High Probability Combos */}
              <div className="space-y-4">
                <h3 className="font-black text-sm text-[#8B866D] uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  High Probability Predictions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {predictions.hotCombos.length > 0 ? (
                    predictions.hotCombos.map(combo => (
                      <div key={combo.id} className="bg-[#2D2D2D] text-white p-5 rounded-2xl shadow-md group border border-transparent hover:border-amber-500/30 transition-all">
                        <div className="flex justify-between items-center mb-4">
                          <span className="font-black text-amber-400">{combo.name}</span>
                          <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded uppercase">
                            {combo.structures.length - combo.missing.length} / {combo.structures.length}
                          </span>
                        </div>
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Target Buildings:</p>
                          <div className="flex flex-wrap gap-2">
                            {combo.structures.map(s => (
                              <div key={s} className="flex items-center gap-1.5">
                                {selectedStructures.includes(s) ? (
                                  <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-white/10" />
                                )}
                                <span className={cn(
                                  "text-xs font-bold",
                                  selectedStructures.includes(s) ? "text-white" : "text-white/30"
                                )}>
                                  {s}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-16 text-center opacity-30 italic text-sm">
                      Select building seeds to reveal combo probabilities...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : appMode === "all" ? (
          /* List Mode: Simple and clean */
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E1D1] pb-2 mb-6">
              <h2 className="font-bold flex items-center gap-2">
                <Package className="w-5 h-5" />
                {showFavoritesOnly ? "Favorite Combinations" : "All Combinations"} ({filteredCombos.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCombos.map((combo) => {
                const hasCount = combo.structures.filter(s => selectedStructures.includes(s)).length;
                const isFormed = hasCount === combo.structures.length;
                const isPartial = hasCount > 0 && !isFormed;

                return (
                  <div key={combo.id} className={cn(
                    "bg-white border p-4 rounded-xl shadow-sm transition-all group relative",
                    isFormed ? "border-amber-400 bg-amber-50/30" : "border-[#E5E1D1] hover:border-[#FFD93D]"
                  )}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-black text-[#1A1A1A] group-hover:text-amber-600 transition-colors pr-8 flex items-center gap-2">
                          {combo.name}
                          {isFormed && <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        </h3>
                        {isPartial && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100/50 px-1.5 py-0.5 rounded w-fit">
                            Potential: {hasCount}/{combo.structures.length}
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(combo.id);
                        }}
                        className={cn(
                          "absolute top-4 right-4 p-1 rounded-full transition-all",
                          favorites.includes(combo.id) ? "text-red-500 scale-110" : "text-[#D1CCB6] hover:text-red-300"
                        )}
                      >
                        <Heart className={cn("w-5 h-5", favorites.includes(combo.id) && "fill-current")} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {combo.structures.map((s, idx) => {
                        const isMatched = selectedStructures.includes(s);
                        return (
                          <span key={idx} className={cn(
                            "px-2 py-0.5 rounded text-xs font-bold transition-all border",
                            isMatched 
                              ? "bg-amber-100 text-amber-900 border-amber-300" 
                              : "bg-[#FDFCF6] text-[#8B866D] border-[#E5E1D1]"
                          )}>
                            {s}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filteredCombos.length === 0 && (
                <div className="col-span-full py-20 text-center">
                  <Heart className="w-12 h-12 mx-auto mb-4 text-[#D1CCB6]" />
                  <p className="text-lg font-bold text-[#2D2D2D]">No favorites found</p>
                  <p className="text-sm text-[#A6A189]">Mark combos with a heart to see them here.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Planner Mode: Choosing buildings */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Building Selection */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl border border-[#E5E1D1] p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold flex items-center gap-2">
                    <Plus className="w-5 h-5 text-amber-500" />
                    Select Structures
                  </h2>
                  <span className="text-[10px] font-black bg-[#EFEBD8] px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    {selectedStructures.length} picked
                  </span>
                </div>
                
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 min-h-[4rem] items-start p-3 bg-[#FDFCF6] rounded-xl border border-dashed border-[#D1CCB6]">
                    {selectedStructures.length === 0 && (
                      <p className="text-[11px] text-[#A6A189] italic font-medium">Click buildings below to check for matches...</p>
                    )}
                    {selectedStructures.map(s => (
                      <button 
                        key={s}
                        onClick={() => toggleStructure(s)}
                        className="bg-white border border-amber-200 pl-2 pr-1.5 py-0.5 rounded-md text-[11px] font-black flex items-center gap-1 group hover:border-red-400 hover:bg-red-50 transition-all text-amber-900"
                      >
                        {s}
                        <X className="w-3 h-3 text-amber-400 group-hover:text-red-500" />
                      </button>
                    ))}
                    {selectedStructures.length > 0 && (
                      <button 
                        onClick={() => setSelectedStructures([])}
                        className="text-[10px] font-black text-red-500 hover:underline ml-auto block pt-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-1 gap-1">
                      {allStructures
                        .filter(s => s.toLowerCase().includes(search.toLowerCase()))
                        .map(s => (
                        <button
                          key={s}
                          onClick={() => toggleStructure(s)}
                          className={cn(
                            "w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between group",
                            selectedStructures.includes(s)
                              ? "bg-[#2D2D2D] text-white"
                              : "bg-[#EFEBD8] text-[#5D5948] hover:bg-[#E5E1D1]"
                          )}
                        >
                          {s}
                          {selectedStructures.includes(s) ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#FFD93D]" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Simple Results */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-[#2D2D2D] rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <Zap className="w-32 h-32" />
                </div>
                <h2 className="text-xl font-black mb-6 flex items-center gap-2 relative z-10">
                  Formed Combinations
                  {activeCombos.length > 0 && (
                    <span className="text-xs bg-[#FFD93D] text-black px-2 py-0.5 rounded-full ml-2">
                      {activeCombos.length}
                    </span>
                  )}
                </h2>

                <div className="space-y-3 relative z-10">
                  {activeCombos.length > 0 ? (
                    activeCombos.map(combo => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={combo.id} 
                        className="bg-white/10 p-4 rounded-xl border border-white/10 flex justify-between items-center group/item"
                      >
                        <div>
                          <p className="font-black text-[#FFD93D] mb-1 flex items-center gap-2">
                            {combo.name}
                            {favorites.includes(combo.id) && <Heart className="w-3 h-3 fill-red-500 text-red-500" />}
                          </p>
                          <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">
                            {combo.structures.join(" • ")}
                          </p>
                        </div>
                        <button 
                          onClick={() => toggleFavorite(combo.id)}
                          className={cn(
                            "opacity-0 group-hover/item:opacity-100 transition-all p-2 rounded-lg hover:bg-white/5",
                            favorites.includes(combo.id) ? "opacity-100 text-red-500" : "text-white/40 hover:text-white"
                          )}
                        >
                          <Heart className={cn("w-5 h-5", favorites.includes(combo.id) && "fill-current")} />
                        </button>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-12 text-center opacity-30">
                      <HelpCircle className="w-10 h-10 mx-auto mb-3" />
                      <p className="font-bold">No combos matched yet.</p>
                      <p className="text-xs">Pick buildings from the list to see results.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Synergistic Groups Section */}
              {synergisticGroups.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-black text-sm text-[#8B866D] uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Layout Clusters ({synergisticGroups.length})
                  </h3>
                  <div className="space-y-4">
                    {synergisticGroups.map((group, gIdx) => {
                      const groupStructures = new Set<string>();
                      group.forEach(c => c.structures.forEach(s => groupStructures.add(s)));
                      return (
                        <div key={gIdx} className="bg-amber-50/50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="font-black text-amber-900 text-sm">Cluster Group #{gIdx + 1}</h4>
                            <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-lg">
                              {group.length} Synergies
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Synergistic Combo Sets</p>
                              <div className="space-y-3">
                                {group.map(combo => (
                                  <div key={combo.id} className="bg-white/80 border border-amber-200 p-3 rounded-xl shadow-sm">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="font-black text-xs text-[#1A1A1A]">{combo.name}</span>
                                      {favorites.includes(combo.id) && <Heart className="w-3 h-3 fill-red-500 text-red-500" />}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {combo.structures.map(s => {
                                        // Count how many combos in this group use this structure
                                        const usageCount = group.filter(c => c.structures.includes(s)).length;
                                        return (
                                          <span 
                                            key={s} 
                                            className={cn(
                                              "text-[10px] px-1.5 py-0.5 rounded font-bold transition-all border",
                                              usageCount > 1 
                                                ? "bg-amber-100 text-amber-900 border-amber-300" 
                                                : "bg-[#FDFCF6] text-[#8B866D] border-[#E5E1D1]"
                                            )}
                                            title={usageCount > 1 ? "Shared building used in multiple combos" : "Unique building"}
                                          >
                                            {s}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest group-hover:text-amber-600 transition-colors">Consolidated Layout ({groupStructures.size} Buildings)</p>
                              <div className="bg-white/40 p-4 rounded-xl border border-amber-100 border-dashed">
                                <div className="flex flex-wrap gap-2">
                                  {Array.from(groupStructures).map(s => {
                                    const isShared = group.filter(c => c.structures.includes(s)).length > 1;
                                    return (
                                      <div key={s} className="flex flex-col items-center gap-1">
                                        <span className={cn(
                                          "px-2.5 py-1 rounded-lg text-[11px] font-black shadow-sm flex items-center gap-1.5",
                                          isShared 
                                            ? "bg-amber-900 text-white" 
                                            : "bg-[#EFEBD8] text-[#5D5948]"
                                        )}>
                                          {isShared && <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />}
                                          {s}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="mt-4 text-[10px] text-amber-900/60 font-bold uppercase leading-relaxed">
                                  <span className="text-amber-900">Pro Tip:</span> The darker items with the spark icon are shared across combos. Grouping these and surrounding them with the lighter unique items is the most efficient town layout.
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <p className="mt-4 text-[11px] text-amber-700 font-medium italic border-t border-amber-100 pt-3">
                            Place these {groupStructures.size} buildings together to trigger all {group.length} combo bonuses.
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 border-t border-[#E5E1D1] py-12 px-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8B866D]">Dream Town Finder v2.0</p>
        <p className="text-[11px] font-bold text-[#A6A189] mt-2 italic">Using the official 186-combo standard list.</p>
      </footer>
    </div>
  );
}
