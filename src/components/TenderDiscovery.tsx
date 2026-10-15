import React, { useState, useEffect } from 'react';
import { Search, Globe, ExternalLink, Calendar, MapPin, Building, Tag, CheckCircle2, RefreshCw, ArrowRight, ShieldCheck } from 'lucide-react';
import { IDiscoveredLead, ITender } from '../lib/types/tender';

interface TenderDiscoveryProps {
  onSelectTenderForAnalysis: (tender: Partial<ITender>) => void;
  isDarkMode?: boolean;
}

export const TenderDiscovery: React.FC<TenderDiscoveryProps> = ({ 
  onSelectTenderForAnalysis,
  isDarkMode = false
}) => {
  const [query, setQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('All Provinces');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [leads, setLeads] = useState<IDiscoveredLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceNote, setSourceNote] = useState('');

  const provinces = ['All Provinces', 'National', 'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Mpumalanga', 'Eastern Cape'];
  const categories = ['All Categories', 'ICT & Technology', 'Civil & Construction', 'Security & Facilities', 'Logistics & Fleet', 'Professional Services'];

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append('q', query.trim());
      if (selectedProvince !== 'All Provinces') params.append('province', selectedProvince);

      const res = await fetch(`/api/scrape?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.leads) {
        setLeads(data.leads);
        setSourceNote(data.source || 'South African eTender Notice Boards');
      }
    } catch (err) {
      console.warn('[Discovery Feed fetch error]:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [selectedProvince]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLeads();
  };

  const filteredLeads = leads.filter(l => {
    if (selectedCategory === 'All Categories') return true;
    return l.category === selectedCategory;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header & Controls */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-5 h-5 text-emerald-600" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                South African eTender Discovery Feed
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold dark:bg-slate-850 dark:text-slate-300 dark:border-slate-800">
                SerpApi Crawler
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} leading-relaxed`}>
              Targeting South African national eTender portal (etenders.gov.za), municipal boards, Transnet, SANRAL, and Eskom.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLeads}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tenders by keyword, commodity (e.g., 'cloud', 'asphalt', 'security')..."
                className={`w-full border rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                  isDarkMode 
                    ? 'bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500' 
                    : 'bg-slate-50 border-slate-300 text-slate-800 placeholder:text-slate-400 focus:bg-white'
                }`}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-2xs"
            >
              Search Tenders
            </button>
          </div>

          <div className={`flex flex-wrap items-center gap-2 pt-2 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'} text-xs`}>
            <div className={`flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} mr-2`}>
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>Province:</span>
            </div>
            {provinces.map(prov => (
              <button
                key={prov}
                type="button"
                onClick={() => setSelectedProvince(prov)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors border ${
                  selectedProvince === prov
                    ? isDarkMode
                      ? 'bg-slate-800 text-emerald-400 font-semibold border-slate-700'
                      : 'bg-emerald-50 text-emerald-800 font-semibold border-emerald-300'
                    : isDarkMode
                      ? 'text-slate-400 hover:text-slate-200 bg-slate-950/60 border-slate-800'
                      : 'text-slate-600 hover:text-slate-900 bg-slate-100 border-slate-200'
                }`}
              >
                {prov}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className={`flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} mr-2`}>
              <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Sector:</span>
            </div>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors border ${
                  selectedCategory === cat
                    ? isDarkMode
                      ? 'bg-slate-800 text-amber-300 font-semibold border-slate-700'
                      : 'bg-amber-50 text-amber-800 font-semibold border-amber-300'
                    : isDarkMode
                      ? 'text-slate-400 hover:text-slate-200 bg-slate-950/60 border-slate-800'
                      : 'text-slate-600 hover:text-slate-900 bg-slate-100 border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Results Header */}
      <div className={`flex items-center justify-between text-xs px-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
        <div>
          Showing <span className={`font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{filteredLeads.length}</span> active opportunities
          {sourceNote && <span> · Source: <span className="text-emerald-600 font-medium">{sourceNote}</span></span>}
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>CSD MAAA Verification Enforced</span>
        </div>
      </div>

      {/* Tender Lead Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredLeads.map((lead) => (
          <div
            key={lead.id}
            className={`${isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'} border rounded-xl p-5 flex flex-col justify-between transition-all group`}
          >
            <div>
              {/* Top row info */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="font-mono text-xs font-semibold text-emerald-600">
                  {lead.referenceNumber}
                </span>
                <span className={`text-[11px] flex items-center gap-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Closes: {lead.closingDate}</span>
                </span>
              </div>

              {/* Title */}
              <h3 className={`font-bold text-sm leading-snug mb-2 transition-colors ${
                isDarkMode ? 'text-white group-hover:text-emerald-300' : 'text-slate-900 group-hover:text-emerald-700'
              }`}>
                {lead.title}
              </h3>

              {/* Department & Location */}
              <div className={`text-xs mb-3 flex items-center gap-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{lead.department}</span>
                <span>·</span>
                <span>{lead.province}</span>
              </div>

              {/* Snippet */}
              <p className={`text-xs leading-relaxed mb-4 line-clamp-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                {lead.snippet}
              </p>

              {/* Badges / Requirements */}
              <div className="flex flex-wrap items-center gap-1.5 mb-4 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800 font-semibold">
                  CSD Mandatory
                </span>
                {lead.cidbGrading && (
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 font-semibold">
                    CIDB {lead.cidbGrading}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded border ${
                  isDarkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {lead.category}
                </span>
                {lead.budgetEst && (
                  <span className={`px-2 py-0.5 rounded border ${
                    isDarkMode ? 'bg-slate-950 text-slate-300 border-slate-800' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    Est: {lead.budgetEst}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Card Actions */}
            <div className={`pt-3 border-t flex items-center justify-between gap-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <a
                href={lead.link}
                target="_blank"
                rel="noreferrer"
                className={`text-[11px] flex items-center gap-1 transition-colors ${
                  isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>View Source</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                onClick={() => {
                  onSelectTenderForAnalysis({
                    title: lead.title,
                    referenceNumber: lead.referenceNumber,
                    issuingDepartment: lead.department,
                    closingDate: lead.closingDate,
                    category: lead.category as any,
                    province: lead.province,
                    cidbGradingRequired: lead.cidbGrading,
                    rawTextExcerpt: lead.rawSampleText || lead.snippet
                  });
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-2xs"
              >
                <span>Analyze with Agent</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
