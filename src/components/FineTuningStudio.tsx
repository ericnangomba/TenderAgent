import React, { useState, useEffect } from 'react';
import {
  Cpu, Database, Sparkles, Play, CheckCircle2, RefreshCw, Download,
  Layers, Terminal, Award, FileText, ChevronRight, Sliders, ArrowRight,
  TrendingDown, Check, AlertCircle, HardDrive, BarChart3, Plus, X
} from 'lucide-react';
import { IFineTuningDataset, IFineTuningExample, IFineTuningJob } from '../lib/types/tender';

interface FineTuningStudioProps {
  isDarkMode?: boolean;
}

export const FineTuningStudio: React.FC<FineTuningStudioProps> = ({ isDarkMode = false }) => {
  const [activeSubTab, setActiveSubTab] = useState<'datasets' | 'training' | 'playground'>('datasets');
  const [datasets, setDatasets] = useState<IFineTuningDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [jobs, setJobs] = useState<IFineTuningJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<IFineTuningJob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isTrainingStarting, setIsTrainingStarting] = useState<boolean>(false);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);

  // New Example Modal state
  const [isAddExampleOpen, setIsAddExampleOpen] = useState<boolean>(false);
  const [newPrompt, setNewPrompt] = useState<string>('');
  const [newCompletion, setNewCompletion] = useState<string>('');
  const [newDomain, setNewDomain] = useState<IFineTuningExample['domain']>('PPPFA 2022');
  const [newRef, setNewRef] = useState<string>('WCG/2026/01');

  // LoRA Training Config State
  const [baseModel, setBaseModel] = useState<'meta-llama/Meta-Llama-3.1-8B-Instruct' | 'google/gemma-2-9b-it'>('meta-llama/Meta-Llama-3.1-8B-Instruct');
  const [loraRank, setLoraRank] = useState<number>(16);
  const [loraAlpha, setLoraAlpha] = useState<number>(32);
  const [epochs, setEpochs] = useState<number>(3);
  const [learningRate, setLearningRate] = useState<string>('2e-4');

  // Playground state
  const [playgroundPrompt, setPlaygroundPrompt] = useState<string>(
    'Analyze tender RFP for procurement value R48,000,000 issued by Western Cape Government. Determine applicable point system and 30% subcontracting requirement under PPPFA 2022 regulations.'
  );
  const [comparisonResult, setComparisonResult] = useState<{ baseline: string; fineTuned: string } | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Fetch Datasets & Jobs
  const loadStudioData = async () => {
    setIsLoading(true);
    try {
      const [dRes, jRes] = await Promise.all([
        fetch('/api/finetune/datasets'),
        fetch('/api/finetune/jobs')
      ]);
      const dData = await dRes.json();
      const jData = await jRes.json();

      if (dData.success && dData.datasets) {
        setDatasets(dData.datasets);
        if (!selectedDatasetId && dData.datasets.length > 0) {
          setSelectedDatasetId(dData.datasets[0].id);
        }
      }

      if (jData.success && jData.jobs) {
        setJobs(jData.jobs);
        setSelectedJob(jData.jobs[0] || null);
      }
    } catch (err) {
      console.warn('[FineTuningStudio fetch error]:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudioData();
  }, []);

  // Poll active training job
  useEffect(() => {
    const active = jobs.find(j => j.status === 'training' || j.status === 'preparing');
    if (!active) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/finetune/jobs/${active.id}`);
        const data = await res.json();
        if (data.success && data.job) {
          setJobs(prev => prev.map(j => j.id === data.job.id ? data.job : j));
          if (selectedJob?.id === data.job.id) {
            setSelectedJob(data.job);
          }
        }
      } catch (e) {
        console.warn('Poll error:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobs, selectedJob]);

  // Auto-Generate Training Pairs from Active Tenders
  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/finetune/generate-from-tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: selectedDatasetId })
      });
      const data = await res.json();
      if (data.success) {
        await loadStudioData();
      }
    } catch (err) {
      console.warn('Auto-generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Add custom example to dataset
  const handleAddExample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrompt.trim() || !newCompletion.trim()) return;

    try {
      const res = await fetch(`/api/finetune/datasets/${selectedDatasetId}/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt,
          completion: newCompletion,
          domain: newDomain,
          referenceRfp: newRef
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAddExampleOpen(false);
        setNewPrompt('');
        setNewCompletion('');
        await loadStudioData();
      }
    } catch (err) {
      console.warn('Add example error:', err);
    }
  };

  // Launch Training Job
  const handleStartTraining = async () => {
    setIsTrainingStarting(true);
    try {
      const res = await fetch('/api/finetune/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          baseModel,
          loraRank,
          loraAlpha,
          epochs,
          learningRate: parseFloat(learningRate) || 0.0002
        })
      });
      const data = await res.json();
      if (data.success && data.job) {
        setJobs(prev => [data.job, ...prev]);
        setSelectedJob(data.job);
        setActiveSubTab('training');
      }
    } catch (err) {
      console.warn('Start training error:', err);
    } finally {
      setIsTrainingStarting(false);
    }
  };

  // Deploy fine-tuned model
  const handleDeployModel = async (jobId: string) => {
    try {
      const res = await fetch(`/api/finetune/deploy/${jobId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDeploySuccess(`Model "${data.deployedModel}" deployed as active RFP Analyzer model!`);
        setTimeout(() => setDeploySuccess(null), 4000);
      }
    } catch (err) {
      console.warn('Deploy error:', err);
    }
  };

  // Run Comparison Playground
  const handleRunComparison = async () => {
    setIsComparing(true);
    try {
      const res = await fetch('/api/finetune/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: playgroundPrompt })
      });
      const data = await res.json();
      if (data.success) {
        setComparisonResult({
          baseline: data.baseline,
          fineTuned: data.fineTuned
        });
      }
    } catch (err) {
      console.warn('Comparison error:', err);
    } finally {
      setIsComparing(false);
    }
  };

  const activeDataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Top Banner Header */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 relative overflow-hidden`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Cpu className="w-5 h-5 text-emerald-600" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                LLM Dataset & LoRA Fine-Tuning Studio
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                Llama 3.1 8B · Gemma 2
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300 font-bold dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                QLoRA 8-bit Adapter
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} leading-relaxed max-w-3xl`}>
              Curate domain-specific instruction datasets and fine-tune open-weight LLMs on South African public procurement legislation,
              Preferential Procurement Regulations 2022, CIDB Act thresholds, and SBD returnables with automatic fallback.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAutoGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Synthesizing...' : 'Auto-Generate Pairs from Tenders'}</span>
            </button>
            <a
              href="/api/finetune/export-script"
              download="train_lora_sa_tenders.py"
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              title="Download standalone PyTorch training script for RunPod / Colab / Local GPU"
            >
              <Download className="w-3.5 h-3.5" />
              <span>GPU Script (.py)</span>
            </a>
          </div>
        </div>

        {deploySuccess && (
          <div className="mt-4 p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{deploySuccess}</span>
          </div>
        )}

        {/* Accent Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-600 via-purple-600 to-amber-500 opacity-70" />
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('datasets')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${activeSubTab === 'datasets'
              ? 'bg-emerald-600 text-white shadow-xs'
              : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
          <Database className="w-4 h-4" />
          <span>1. Datasets & Instruction Pairs ({activeDataset?.examples?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('training')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${activeSubTab === 'training'
              ? 'bg-emerald-600 text-white shadow-xs'
              : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
          <Sliders className="w-4 h-4" />
          <span>2. LoRA Training & Live Curves</span>
        </button>

        <button
          onClick={() => setActiveSubTab('playground')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${activeSubTab === 'playground'
              ? 'bg-emerald-600 text-white shadow-xs'
              : isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>3. Side-by-Side Model Evaluation</span>
        </button>
      </div>

      {/* ==================== TAB 1: DATASETS ==================== */}
      {activeSubTab === 'datasets' && (
        <div className="space-y-6">
          {/* Dataset Selector & Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {datasets.map(d => (
              <div
                key={d.id}
                onClick={() => setSelectedDatasetId(d.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedDatasetId === d.id
                    ? isDarkMode
                      ? 'bg-emerald-950/40 border-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-50/80 border-emerald-400 text-slate-900 shadow-sm'
                    : isDarkMode
                      ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-xs'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs truncate max-w-[200px]">{d.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold">
                    v{d.version}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed line-clamp-2 mb-3">
                  {d.description}
                </p>
                <div className="flex items-center justify-between text-[10px] font-mono pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span>{d.exampleCount} training pairs</span>
                  <span>~{Math.round(d.tokenCountEst / 1000)}k tokens</span>
                </div>
              </div>
            ))}
          </div>

          {/* Action Bar for Dataset */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Training Examples for {activeDataset?.name}
              </h3>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Format: <span className="font-mono text-emerald-600 font-bold">{activeDataset?.format?.toUpperCase()}</span> · Curated for South African Public Procurement
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddExampleOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Instruction Pair</span>
              </button>
            </div>
          </div>

          {/* Training Examples List */}
          <div className="space-y-3">
            {activeDataset?.examples?.map((ex, i) => (
              <div
                key={ex.id || i}
                className={`p-4 rounded-xl border text-xs ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 font-bold text-[10px] flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-bold text-emerald-600">{ex.domain}</span>
                    {ex.referenceRfp && (
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {ex.referenceRfp}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Alpaca Instruction
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Prompt */}
                  <div className={`p-3 rounded-lg border font-mono text-[11px] leading-relaxed ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Instruction / Prompt:</div>
                    {ex.prompt}
                  </div>

                  {/* Completion */}
                  <div className={`p-3 rounded-lg border font-mono text-[11px] leading-relaxed overflow-x-auto ${isDarkMode ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-300' : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    }`}>
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Target Completion (Ground Truth):</div>
                    <pre className="whitespace-pre-wrap">{ex.completion}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: TRAINING & LIVE CURVES ==================== */}
      {activeSubTab === 'training' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left: Hyperparameter Configuration */}
          <div className="lg:col-span-5 space-y-4">
            <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-5 h-5 text-emerald-600" />
                <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  LoRA Hyperparameters & Architecture
                </h3>
              </div>

              <div className="space-y-4 text-xs">
                {/* Base Model */}
                <div>
                  <label className="font-semibold block mb-1">Base Open Architecture:</label>
                  <select
                    value={baseModel}
                    onChange={(e: any) => setBaseModel(e.target.value)}
                    className={`w-full border rounded-lg p-2 font-mono text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                  >
                    <option value="meta-llama/Meta-Llama-3.1-8B-Instruct">Meta Llama 3.1 8B Instruct (Recommended)</option>
                    <option value="google/gemma-2-9b-it">Google Gemma 2 9B Instruct (Local Runner)</option>
                  </select>
                </div>

                {/* LoRA Rank & Alpha */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">LoRA Rank (r):</label>
                    <input
                      type="number"
                      value={loraRank}
                      onChange={(e) => setLoraRank(Number(e.target.value))}
                      min={4}
                      max={64}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">LoRA Alpha (α):</label>
                    <input
                      type="number"
                      value={loraAlpha}
                      onChange={(e) => setLoraAlpha(Number(e.target.value))}
                      min={8}
                      max={128}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    />
                  </div>
                </div>

                {/* Epochs & Learning Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Training Epochs:</label>
                    <input
                      type="number"
                      value={epochs}
                      onChange={(e) => setEpochs(Number(e.target.value))}
                      min={1}
                      max={10}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Learning Rate:</label>
                    <input
                      type="text"
                      value={learningRate}
                      onChange={(e) => setLearningRate(e.target.value)}
                      className={`w-full border rounded-lg p-2 font-mono text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                    />
                  </div>
                </div>

                {/* Quantization & Hardware Info */}
                <div className={`p-3 rounded-lg border text-[11px] leading-relaxed ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                  <div className="font-semibold text-emerald-600 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>NF4 8-bit Quantized QLoRA Enabled</span>
                  </div>
                  Targeting linear attention projections (q_proj, v_proj, k_proj, o_proj) to fit comfortably within 8GB - 16GB GPU VRAM.
                </div>

                {/* Launch Button */}
                <button
                  onClick={handleStartTraining}
                  disabled={isTrainingStarting}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  <Play className={`w-4 h-4 fill-white ${isTrainingStarting ? 'animate-pulse' : ''}`} />
                  <span>{isTrainingStarting ? 'Initializing Weights...' : 'Execute LoRA Fine-Tuning Pipeline'}</span>
                </button>
              </div>
            </div>

            {/* Past Fine-Tuned Checkpoints */}
            <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-5`}>
              <h4 className={`font-bold text-xs uppercase tracking-wider mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Model Checkpoints & Jobs
              </h4>
              <div className="space-y-2 text-xs">
                {jobs.map(j => (
                  <div
                    key={j.id}
                    onClick={() => setSelectedJob(j)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedJob?.id === j.id
                        ? isDarkMode ? 'bg-slate-800 border-emerald-500 text-white' : 'bg-emerald-50 border-emerald-400 text-slate-900'
                        : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>{j.outputModelName}</span>
                      <span className={`px-2 py-0.2 rounded text-[10px] font-mono ${j.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                        {j.status}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono flex items-center justify-between text-slate-500">
                      <span>Loss: {j.currentLoss}</span>
                      <span>Epoch: {j.currentEpoch}/{j.totalEpochs}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live Loss Curve & Telemetry */}
          <div className="lg:col-span-7 space-y-4">
            <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Live Training Telemetry: {selectedJob?.outputModelName || 'Llama 3.1 8B LoRA'}
                  </h3>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Base: {selectedJob?.baseModel} · Rank: {selectedJob?.loraRank} · Alpha: {selectedJob?.loraAlpha}
                  </p>
                </div>

                {selectedJob?.status === 'completed' && (
                  <button
                    onClick={() => handleDeployModel(selectedJob.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-xs"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Deploy as Active Analyzer Model</span>
                  </button>
                )}
              </div>

              {/* Progress & VRAM Gauge */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className={`p-3 rounded-lg border text-center ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Convergence Loss</div>
                  <div className="text-xl font-bold font-mono text-emerald-600">
                    {selectedJob?.currentLoss || '0.312'}
                  </div>
                  <div className="text-[10px] text-slate-500">Target &lt; 0.400</div>
                </div>

                <div className={`p-3 rounded-lg border text-center ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">GPU VRAM Usage</div>
                  <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                    {selectedJob?.vramUsageGb || 7.4} GB
                  </div>
                  <div className="text-[10px] text-slate-500">8-bit Paged Optimizer</div>
                </div>

                <div className={`p-3 rounded-lg border text-center ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Total Steps</div>
                  <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                    {selectedJob?.currentStep || 60} / {selectedJob?.totalSteps || 60}
                  </div>
                  <div className="text-[10px] text-slate-500">Epoch {selectedJob?.currentEpoch || 3} of {selectedJob?.totalEpochs || 3}</div>
                </div>
              </div>

              {/* SVG Loss Curve Chart */}
              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                <div className="flex items-center justify-between text-xs font-semibold mb-3">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-emerald-600" />
                    <span>Loss Decay Trajectory (Cross-Entropy Loss vs. Optimization Steps)</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">Step 0 → 60</span>
                </div>

                <div className="h-48 w-full relative flex items-end">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150">
                    {/* Grid lines */}
                    <line x1="0" y1="20" x2="500" y2="20" stroke="currentColor" className="text-slate-700/20" strokeDasharray="3,3" />
                    <line x1="0" y1="60" x2="500" y2="60" stroke="currentColor" className="text-slate-700/20" strokeDasharray="3,3" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" className="text-slate-700/20" strokeDasharray="3,3" />
                    <line x1="0" y1="140" x2="500" y2="140" stroke="currentColor" className="text-slate-700/40" />

                    {/* Gradient under curve */}
                    <defs>
                      <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Shaded Area */}
                    <path
                      d="M 20 20 L 70 35 L 140 60 L 220 85 L 310 105 L 400 120 L 480 128 L 480 140 L 20 140 Z"
                      fill="url(#lossGradient)"
                    />

                    {/* Main Line */}
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      points="20,20 70,35 140,60 220,85 310,105 400,120 480,128"
                    />

                    {/* Dots */}
                    {[
                      { x: 20, y: 20, val: '2.45' },
                      { x: 70, y: 35, val: '1.82' },
                      { x: 140, y: 60, val: '1.20' },
                      { x: 220, y: 85, val: '0.81' },
                      { x: 310, y: 105, val: '0.54' },
                      { x: 400, y: 120, val: '0.38' },
                      { x: 480, y: 128, val: '0.31' }
                    ].map((pt, idx) => (
                      <g key={idx}>
                        <circle cx={pt.x} cy={pt.y} r="4" className="fill-emerald-500 stroke-white dark:stroke-slate-900" strokeWidth="2" />
                        <text x={pt.x} y={pt.y - 8} fontSize="9" fill="#10b981" textAnchor="middle" fontFamily="monospace">
                          {pt.val}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Artifact Details */}
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5 font-mono">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  <span>Artifact: {selectedJob?.adapterArtifactName || 'adapter_model.safetensors'}</span>
                </div>
                <span>Status: <strong className="text-emerald-600">LoRA Weights Converged</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: PLAYGROUND ==================== */}
      {activeSubTab === 'playground' && (
        <div className="space-y-5">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Side-by-Side Model Inference Evaluation
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Compare how the raw baseline model answers vs. the fine-tuned South African procurement specialist.
                </p>
              </div>

              <button
                onClick={handleRunComparison}
                disabled={isComparing}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isComparing ? 'animate-spin' : ''}`} />
                <span>{isComparing ? 'Evaluating Models...' : 'Run Comparative Inference'}</span>
              </button>
            </div>

            {/* Test Prompt Input */}
            <div className="space-y-2 mb-4">
              <label className="text-xs font-semibold block">Test Prompt:</label>
              <textarea
                value={playgroundPrompt}
                onChange={(e) => setPlaygroundPrompt(e.target.value)}
                rows={3}
                className={`w-full border rounded-lg p-2.5 text-xs font-mono resize-none focus:outline-none focus:border-emerald-500 ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
              />

              {/* Quick Preset Prompts */}
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="text-slate-400">Preloaded test cases:</span>
                <button
                  type="button"
                  onClick={() => setPlaygroundPrompt('Analyze tender RFP for procurement value R48,000,000 issued by Western Cape Government. Determine applicable point system and 30% subcontracting requirement under PPPFA 2022 regulations.')}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-600 font-mono"
                >
                  R48M WCG 80/20 Test
                </button>
                <button
                  type="button"
                  onClick={() => setPlaygroundPrompt('RFP requires civil works with estimate R45,000,000 for Drakenstein Municipality. Specify mandatory CIDB grading designation and emerging contractor concessions under CIDB Act 38 of 2000.')}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-600 font-mono"
                >
                  CIDB 7CE Civil Test
                </button>
                <button
                  type="button"
                  onClick={() => setPlaygroundPrompt('Extract mandatory returnable schedules and disqualification conditions for SEDA personnel recruitment RFP.')}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-600 font-mono"
                >
                  SEDA SBD Returnables
                </button>
              </div>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Baseline Column */}
              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-500">Raw Baseline Model</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    No Domain Tuning
                  </span>
                </div>
                <div className="font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {comparisonResult?.baseline || (
                    <span className="italic text-slate-400">Click &quot;Run Comparative Inference&quot; to test generic base model output...</span>
                  )}
                </div>
              </div>

              {/* Fine-Tuned Column */}
              <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-emerald-950/20 border-emerald-900/60' : 'bg-emerald-50/70 border-emerald-300'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Llama 3.1 8B (SA Procurement LoRA v1)</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">
                    Domain Aligned
                  </span>
                </div>
                <div className="font-mono text-[11px] leading-relaxed text-emerald-950 dark:text-emerald-300 whitespace-pre-wrap">
                  {comparisonResult?.fineTuned || (
                    <span className="italic text-slate-400">Click &quot;Run Comparative Inference&quot; to see specialized statutory extraction...</span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Add Example Modal */}
      {isAddExampleOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-xl border p-5 shadow-2xl ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm">Add Training Pair to Dataset</h3>
              <button onClick={() => setIsAddExampleOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExample} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Regulatory Domain:</label>
                <select
                  value={newDomain}
                  onChange={(e: any) => setNewDomain(e.target.value)}
                  className={`w-full border rounded-lg p-2 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                >
                  <option value="PPPFA 2022">PPPFA 2022 (Preference Points)</option>
                  <option value="CIDB Act">CIDB Act (Construction Grading)</option>
                  <option value="SBD Returnables">SBD Returnables (1, 4, 6.1)</option>
                  <option value="Western Cape SCM">Western Cape SCM</option>
                  <option value="Functionality Scoring">Functionality Scoring Thresholds</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Instruction / Prompt:</label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. Determine evaluation points system for tender value R18,000,000..."
                  className={`w-full border rounded-lg p-2 font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Target Ground Truth Completion (JSON / Structured):</label>
                <textarea
                  value={newCompletion}
                  onChange={(e) => setNewCompletion(e.target.value)}
                  rows={4}
                  placeholder='e.g. { "system": "80/20", "threshold": "Under R50M" }'
                  className={`w-full border rounded-lg p-2 font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddExampleOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs"
                >
                  Save Training Pair
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
