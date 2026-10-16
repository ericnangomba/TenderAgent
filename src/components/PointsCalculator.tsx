import React, { useState, useId } from 'react';
import { Scale, Calculator, Info, CheckCircle2, TrendingUp, HelpCircle } from 'lucide-react';

interface PointsCalculatorProps {
  initialSystem?: '80/20' | '90/10';
  tenderTitle?: string;
  userBbbeeLevel?: number;
  isDarkMode?: boolean;
}

export const PointsCalculator: React.FC<PointsCalculatorProps> = ({
  initialSystem = '80/20',
  tenderTitle,
  userBbbeeLevel = 1,
  isDarkMode = false
}) => {
  const [system, setSystem] = useState<'80/20' | '90/10'>(initialSystem);
  const [minPrice, setMinPrice] = useState<number>(14500000); // R14.5m lowest benchmark
  const [userPrice, setUserPrice] = useState<number>(15200000); // R15.2m proposed SME quote
  const [bbbeeLevel, setBbbeeLevel] = useState<number>(userBbbeeLevel || 1);
  const [competitorPrice, setCompetitorPrice] = useState<number>(14500000);
  const [competitorBbbee, setCompetitorBbbee] = useState<number>(3);

  const minPriceInputId = useId();
  const userPriceInputId = useId();
  const compPriceInputId = useId();

  // B-BBEE Score mapping under PPR 2022
  const getBbbeePoints = (level: number, currentSystem: '80/20' | '90/10') => {
    if (currentSystem === '80/20') {
      const table: Record<number, number> = { 1: 20, 2: 18, 3: 14, 4: 12, 5: 8, 6: 6, 7: 4, 8: 2 };
      return table[level] || 0;
    } else {
      const table: Record<number, number> = { 1: 10, 2: 9, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };
      return table[level] || 0;
    }
  };

  // PPPFA Formula calculation: Ps = MaxPts * (1 - (Pt - Pmin) / Pmin)
  const calculatePricePoints = (pt: number, pmin: number, currentSystem: '80/20' | '90/10') => {
    if (pmin <= 0 || pt <= 0) return 0;
    const maxPts = currentSystem === '80/20' ? 80 : 90;
    const raw = maxPts * (1 - (pt - pmin) / pmin);
    return Math.max(0, Math.min(maxPts, Number(raw.toFixed(2))));
  };

  const userPricePoints = calculatePricePoints(userPrice, minPrice, system);
  const userBbbeePoints = getBbbeePoints(bbbeeLevel, system);
  const userTotalPoints = Number((userPricePoints + userBbbeePoints).toFixed(2));

  const compPricePoints = calculatePricePoints(competitorPrice, minPrice, system);
  const compBbbeePoints = getBbbeePoints(competitorBbbee, system);
  const compTotalPoints = Number((compPricePoints + compBbbeePoints).toFixed(2));

  const formatZar = (val: number) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Header Banner */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Scale className="w-5 h-5 text-emerald-600" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                South African Preference Points Calculator
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                PPR 2022 / PPPFA
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} leading-relaxed max-w-2xl`}>
              Under South African law, contracts are awarded based on total points scored out of 100
              combining competitive pricing and specific goals (B-BBEE ownership & empowerment).
              {tenderTitle && <span className="text-emerald-600 dark:text-emerald-300 block mt-1 font-semibold">Evaluating: {tenderTitle}</span>}
            </p>
          </div>

          {/* System Toggle (80/20 vs 90/10) */}
          <div className={`flex items-center p-1 rounded-lg shrink-0 border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
            <button
              onClick={() => setSystem('80/20')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${system === '80/20'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              80/20 System (&le; R50M)
            </button>
            <button
              onClick={() => setSystem('90/10')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${system === '90/10'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              90/10 System (&gt; R50M)
            </button>
          </div>
        </div>
      </div>

      {/* Main Calculator Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Form: Pricing & Parameters */}
        <div className="lg:col-span-7 space-y-4">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-5`}>
            <h3 className={`font-semibold text-sm flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              <Calculator className="w-4 h-4 text-emerald-600" />
              <span>Bid Price & B-BBEE Inputs (ZAR)</span>
            </h3>

            {/* Price Inputs */}
            <div className="space-y-4">
              <div>
                <label htmlFor={minPriceInputId} className={`flex items-center justify-between text-xs mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span>Lowest Acceptable Tender Price (Pmin) in ZAR:</span>
                  <span className="font-mono text-emerald-600 font-bold">{formatZar(minPrice)}</span>
                </label>
                <input
                  id={minPriceInputId}
                  type="number"
                  step="50000"
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                    }`}
                />
                <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} mt-0.5 block`}>
                  The benchmark lowest responsive bid submitted in this tender process.
                </span>
              </div>

              <div>
                <label htmlFor={userPriceInputId} className={`flex items-center justify-between text-xs mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span>Your Proposed Tender Price (Pt) in ZAR:</span>
                  <span className="font-mono text-emerald-600 font-bold">{formatZar(userPrice)}</span>
                </label>
                <input
                  id={userPriceInputId}
                  type="number"
                  step="50000"
                  value={userPrice}
                  onChange={(e) => setUserPrice(Number(e.target.value))}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                    }`}
                />
                <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} mt-0.5 block`}>
                  Your bid price inclusive of 15% VAT and all contingencies.
                </span>
              </div>

              {/* B-BBEE Level Selector */}
              <div>
                <div className={`flex items-center justify-between text-xs mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span>Your B-BBEE Contributor Status:</span>
                  <span className="font-mono text-emerald-600 font-semibold">
                    Level {bbbeeLevel} ({userBbbeePoints} Points)
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-xs">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setBbbeeLevel(lvl)}
                      className={`p-2 rounded-lg text-center transition-all border ${bbbeeLevel === lvl
                          ? isDarkMode
                            ? 'bg-emerald-950 border-emerald-700 text-emerald-300 font-bold'
                            : 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold shadow-2xs'
                          : isDarkMode
                            ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                      <div className="text-[11px]">Lvl {lvl}</div>
                      <div className={`text-[9px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{getBbbeePoints(lvl, system)} pts</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Benchmark Competitor Simulation */}
              <div className={`pt-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'} space-y-3`}>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} block`}>
                  Simulate Head-to-Head Competitor Quote:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={compPriceInputId} className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} block mb-1`}>Competitor Quoted Price:</label>
                    <input
                      id={compPriceInputId}
                      type="number"
                      step="50000"
                      value={competitorPrice}
                      onChange={(e) => setCompetitorPrice(Number(e.target.value))}
                      className={`w-full border rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none ${isDarkMode
                          ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-slate-600'
                          : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-slate-400'
                        }`}
                    />
                  </div>
                  <div>
                    <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} block mb-1`}>Competitor B-BBEE Level:</span>
                    <select
                      value={competitorBbbee}
                      onChange={(e) => setCompetitorBbbee(Number(e.target.value))}
                      className={`w-full border rounded px-2.5 py-1.5 text-xs focus:outline-none ${isDarkMode
                          ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-slate-600'
                          : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-slate-400'
                        }`}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                        <option key={l} value={l}>Level {l} ({getBbbeePoints(l, system)} pts)</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Mathematical Proof Card */}
          <div className={`border rounded-xl p-4 font-mono text-xs space-y-2 ${isDarkMode ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
            <div className={`flex items-center gap-1.5 font-semibold text-[11px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Info className="w-3.5 h-3.5 text-emerald-600" />
              <span>National Treasury PPPFA Statutory Formula (PPR 2022)</span>
            </div>
            <p className={`text-[11px] p-2 rounded border ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-800'
              }`}>
              Ps = {system === '80/20' ? '80' : '90'} &times; [ 1 - ( Pt - Pmin ) / Pmin ] + Specific Goals
            </p>
            <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Ps = {system === '80/20' ? '80' : '90'} &times; [ 1 - ({userPrice} - {minPrice}) / {minPrice} ] = <span className="text-emerald-600 font-semibold">{userPricePoints} pts</span>
            </p>
          </div>
        </div>

        {/* Right Card: Score Outcome & Head-to-Head Comparison */}
        <div className="lg:col-span-5 space-y-4">

          {/* Your Score Card */}
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Your Calculated Tender Score
              </span>
              <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{system} Allocation</span>
            </div>

            <div className={`text-4xl font-extrabold mb-3 font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {userTotalPoints} <span className="text-xl text-slate-400 font-normal">/ 100</span>
            </div>

            <div className="space-y-2.5 mb-5 text-xs">
              <div className={`flex items-center justify-between p-2 rounded border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Price Points (Commercial):</span>
                <span className={`font-mono font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {userPricePoints} / {system === '80/20' ? 80 : 90}
                </span>
              </div>
              <div className={`flex items-center justify-between p-2 rounded border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Specific Goals (B-BBEE Lvl {bbbeeLevel}):</span>
                <span className="font-mono font-bold text-emerald-600">
                  {userBbbeePoints} / {system === '80/20' ? 20 : 10}
                </span>
              </div>
            </div>

            {/* Head to head comparative */}
            <div className={`p-3.5 rounded-lg border space-y-2 ${isDarkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
              }`}>
              <div className={`text-[11px] font-semibold flex items-center justify-between ${isDarkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                <span>Head-to-Head Outcome:</span>
                <span className={userTotalPoints >= compTotalPoints ? 'text-emerald-600' : 'text-amber-600'}>
                  {userTotalPoints >= compTotalPoints ? 'Tender Award Advantage' : 'Trailing on Points'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className={`p-2 rounded text-center border ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                  }`}>
                  <span className={`block text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Your Bid</span>
                  <span className={`font-mono font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{userTotalPoints}</span>
                </div>
                <div className={`p-2 rounded text-center border ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                  }`}>
                  <span className={`block text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Competitor</span>
                  <span className={`font-mono font-bold text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{compTotalPoints}</span>
                </div>
              </div>

              <div className="text-[10px] leading-normal pt-1">
                {userTotalPoints >= compTotalPoints ? (
                  <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Your Level {bbbeeLevel} B-BBEE status gives you a resilient buffer against lower price competitors!</span>
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <Info className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>Consider adjusting your price closer to benchmark or leveraging joint venture B-BBEE credits.</span>
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Quick Tips */}
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-5 space-y-2.5 text-xs`}>
            <h4 className={`font-semibold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>South African SCM Strategy Tips</span>
            </h4>
            <ul className={`space-y-1.5 text-[11px] list-disc list-inside ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <li>Level 1 EMEs/QSEs automatically score full 20/20 or 10/10 points.</li>
              <li>A price 10% higher than the lowest bid loses 8 to 9 points on price.</li>
              <li>Always check whether 30% designated group subcontracting applies to contracts &gt; R30M.</li>
            </ul>
          </div>

        </div>

      </div>

    </div>
  );
};
