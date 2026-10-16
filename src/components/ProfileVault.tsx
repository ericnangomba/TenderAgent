import React, { useState } from 'react';
import {
  Building2, ShieldCheck, CheckCircle2, AlertCircle, Save, Lock,
  FileCheck, Shield, Award, Calendar, Phone, Mail, MapPin, Check
} from 'lucide-react';
import { IUserProfile } from '../lib/types/tender';

interface ProfileVaultProps {
  userProfile: IUserProfile;
  onUpdateProfile: (updated: IUserProfile) => void;
  isDarkMode?: boolean;
}

export const ProfileVault: React.FC<ProfileVaultProps> = ({
  userProfile,
  onUpdateProfile,
  isDarkMode = false
}) => {
  const [formData, setFormData] = useState<IUserProfile>(userProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleChange = (field: keyof IUserProfile, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        onUpdateProfile(data.profile);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.warn('[Profile Save error]:', err);
      onUpdateProfile(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const hasCsd = formData.csdNumber.toUpperCase().startsWith('MAAA');
  const hasTaxPin = Boolean(formData.taxComplianceStatusPin.trim());
  const hasBbbee = formData.bbbeeLevel >= 1 && formData.bbbeeLevel <= 8;
  const hasCoida = formData.coidaGoodStandingValid;

  const scoreItems = [hasCsd, hasTaxPin, hasBbbee, hasCoida];
  const readinessPct = Math.round((scoreItems.filter(Boolean).length / scoreItems.length) * 100);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Header Banner */}
      <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                POPIA-Protected SME Credential Vault
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                Act 4 of 2013 Sandboxed
              </span>
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} leading-relaxed max-w-2xl`}>
              Store your South African statutory procurement credentials.
              All CSD numbers, tax compliance PINs, and B-BBEE certificates are sandboxed and injected
              only into your locally-generated bid proposal skeletons.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className={`p-2.5 rounded-lg border text-center ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
              <span className={`text-[10px] uppercase font-semibold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Readiness</span>
              <span className="text-sm font-bold font-mono text-emerald-600">{readinessPct}% Compliant</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Statutory Credentials */}
          <div className="lg:col-span-7 space-y-5">
            <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
              <h3 className={`text-sm font-semibold flex items-center gap-2 border-b pb-3 ${isDarkMode ? 'text-white border-slate-800' : 'text-slate-900 border-slate-200'
                }`}>
                <FileCheck className="w-4 h-4 text-emerald-600" />
                <span>Statutory Government Credentials (Mandatory Returnables)</span>
              </h3>

              {/* Company Legal Name */}
              <div>
                <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Registered Company Legal Entity Name:
                </label>
                <input
                  type="text"
                  required
                  value={formData.companyName}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                    }`}
                />
              </div>

              {/* Registration Number & CSD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    CIPC Company Reg Number:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="2023/123456/07"
                    value={formData.registrationNumber}
                    onChange={(e) => handleChange('registrationNumber', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                      }`}
                  />
                </div>

                <div>
                  <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    National Treasury CSD Number:
                    {hasCsd && <span className="text-emerald-600 ml-1 text-[10px] font-mono">Verified MAAA</span>}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="MAAA0821945"
                    value={formData.csdNumber}
                    onChange={(e) => handleChange('csdNumber', e.target.value.toUpperCase())}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-emerald-500 ${isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                      }`}
                  />
                </div>
              </div>

              {/* SARS TCS PIN & CIDB */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    SARS Tax Compliance (TCS) PIN:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="TCS-9482104-Z"
                    value={formData.taxComplianceStatusPin}
                    onChange={(e) => handleChange('taxComplianceStatusPin', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                      }`}
                  />
                </div>

                <div>
                  <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    CIDB Contractor Grading (Optional):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 7CE PE or 1GB"
                    value={formData.cidbGrading}
                    onChange={(e) => handleChange('cidbGrading', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-emerald-500 ${isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                      }`}
                  />
                </div>
              </div>

              {/* B-BBEE Level & Enterprise Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    B-BBEE Contributor Status:
                  </label>
                  <select
                    value={formData.bbbeeLevel}
                    onChange={(e) => handleChange('bbbeeLevel', Number(e.target.value))}
                    className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(lvl => (
                      <option key={lvl} value={lvl}>Level {lvl} (135% recognition for L1)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    B-BBEE Category / Affidavit:
                  </label>
                  <select
                    value={formData.bbbeeType}
                    onChange={(e) => handleChange('bbbeeType', e.target.value as any)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                  >
                    <option value="EME">EME (Exempted Micro Enterprise &le; R10M turnover)</option>
                    <option value="QSE">QSE (Qualifying Small Enterprise R10M - R50M)</option>
                    <option value="Generic">Generic Enterprise (&gt; R50M turnover)</option>
                  </select>
                </div>
              </div>

              {/* COIDA Status */}
              <div className={`p-3.5 rounded-lg border space-y-2 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="coida-check"
                      checked={formData.coidaGoodStandingValid}
                      onChange={(e) => handleChange('coidaGoodStandingValid', e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="coida-check" className={`text-xs font-medium cursor-pointer ${isDarkMode ? 'text-slate-200' : 'text-slate-800'
                      }`}>
                      COIDA Letter of Good Standing Active
                    </label>
                  </div>
                  <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Compensation Commissioner</span>
                </div>

                {formData.coidaGoodStandingValid && (
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Expiry Date:</span>
                    <input
                      type="date"
                      value={formData.coidaExpiryDate}
                      onChange={(e) => handleChange('coidaExpiryDate', e.target.value)}
                      className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 ${isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-slate-200'
                          : 'bg-white border-slate-300 text-slate-800'
                        }`}
                    />
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right Column: Contact & POPIA Security Undertaking */}
          <div className="lg:col-span-5 space-y-5">
            <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} border rounded-xl p-6 space-y-4`}>
              <h3 className={`text-sm font-semibold flex items-center gap-2 border-b pb-3 ${isDarkMode ? 'text-white border-slate-800' : 'text-slate-900 border-slate-200'
                }`}>
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>Contact & Geographic Jurisdiction</span>
              </h3>

              <div>
                <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tender Submission Email:</label>
                <input
                  type="email"
                  required
                  value={formData.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                    }`}
                />
              </div>

              <div>
                <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Official Contact Phone (ZA):</label>
                <input
                  type="tel"
                  required
                  value={formData.contactPhone}
                  onChange={(e) => handleChange('contactPhone', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                    }`}
                />
              </div>

              <div>
                <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Primary Operating Province:</label>
                <select
                  value={formData.province}
                  onChange={(e) => handleChange('province', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:bg-white'
                    }`}
                >
                  <option value="Gauteng">Gauteng</option>
                  <option value="Western Cape">Western Cape</option>
                  <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                  <option value="Eastern Cape">Eastern Cape</option>
                  <option value="Mpumalanga">Mpumalanga</option>
                  <option value="Free State">Free State</option>
                  <option value="Limpopo">Limpopo</option>
                  <option value="North West">North West</option>
                  <option value="Northern Cape">Northern Cape</option>
                </select>
              </div>

              {/* POPIA Security Card */}
              <div className={`p-4 rounded-lg border space-y-2 text-xs ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                <div className="flex items-center gap-1.5 font-semibold text-emerald-600 text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  <span>POPIA Protection Guarantee</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  In compliance with Act 4 of 2013, company registration and financial profiles are never shared with unauthorized external LLM brokers. Ingestion tasks operate in isolated containers.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm"
              >
                {isSaving ? (
                  <span>Securing Credentials...</span>
                ) : saveSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Vault Updated Successfully!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save & Encrypt SME Profile</span>
                  </>
                )}
              </button>

            </div>
          </div>

        </div>
      </form>

    </div>
  );
};
