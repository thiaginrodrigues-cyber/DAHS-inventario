/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, ErrorInfo, ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from 'recharts';
import { 
  Upload, 
  LayoutDashboard, 
  Map, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
  Scissors,
  Box,
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db } from './firebase';
import { 
  doc, 
  onSnapshot, 
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4 text-center">
          <div className="max-w-md w-full p-8 bg-rose-500/25 border border-rose-500/40 rounded-3xl">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Ops! Algo deu errado.</h2>
            <p className="text-emerald-100/60 mb-6 text-sm">
              Ocorreu um erro inesperado. Tente recarregar a página ou entre em contato com o suporte.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2 rounded-xl font-semibold transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Types ---

interface StreetData {
  id: number;
  name: string;
  plan: number;
  counted: number;
  pending: number;
  status: number;
  errors: number;
  surplus: number;
  shortage: number;
  finalized: number;
}

interface DailyHistory {
  date: string;
  dayName: string;
  count: number;
}

interface WeeklyHistory {
  weekRange: string;
  count: number;
}

interface CollaboratorCount {
  name: string;
  count: number;
}

interface OccupancyMetric {
  area: string;
  structure: number;
  addresses: number;
  occupied: number;
  definitivo: number;
  operacional: number;
  disponivel: number;
  percentage: number;
  isCategory: boolean;
  subcategories?: OccupancyMetric[];
}

interface OccupancyData {
  totalStructure: number;
  totalAddresses: number;
  totalOccupied: number;
  totalDefinitivo: number;
  totalOperacional: number;
  totalDisponivel: number;
  globalPercentage: number;
  areas: OccupancyMetric[];
}

interface InventarioGTSKU {
  sku: string;
  description: string;
  expirationDate: string;
  shelfLifeAL: string | number;
  daysRemaining: number | null;
  category: 'FEFO' | 'PRÉ-FEFO' | 'PERDA' | 'NORMAL';
}

interface InventarioGTData {
  items: InventarioGTSKU[];
  uniqueSKUCount: number;
  fefoCount: number;
  preFefoCount: number;
  perdaCount: number;
}

interface DashboardMetrics {
  totalPositions: number;
  totalCounted: number;
  totalPending: number;
  accuracy: number;
  finalAccuracy: number;
  totalErrors: number;
  surplus: number;
  shortage: number;
  finalizedDivergences: number;
  generalStatus: number;
  streets: StreetData[];
  dailyCount?: number;
  monthlyCount?: number;
  weeklyGoal?: number;
  dailyGoal?: number;
  weeklyGoalCalculated?: number;
  dailyHistory?: DailyHistory[];
  weeklyHistory?: WeeklyHistory[];
  collaboratorCounts?: CollaboratorCount[];
  occupancyData?: OccupancyData;
  inventarioGT?: InventarioGTData;
  updatedAt?: string;
  updatedBy?: string;
}

// --- Components ---

const MetricCard = ({ title, value, icon: Icon, color, subtitle, theme }: { 
  title: string; 
  value: string | number; 
  icon: any; 
  color: string;
  subtitle?: string;
  theme?: any;
}) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className={cn(
      "p-6 rounded-2xl border shadow-sm flex flex-col justify-between transition-all duration-300",
      theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-white border-slate-100"
    )}
  >
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-3 rounded-xl shadow-lg", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {subtitle && (
        <span className={cn("text-xs font-black uppercase tracking-wider", theme ? theme.contentText : "text-slate-400")}>
          {subtitle}
        </span>
      )}
    </div>
    <div>
      <h3 className={cn("text-[10px] font-black mb-1 uppercase tracking-[0.2em]", theme ? theme.contentText : "text-slate-400 opacity-60")}>{title}</h3>
      <p className={cn("text-3xl font-black font-mono tracking-tighter", theme ? theme.contentTitle : "text-slate-900")}>{value}</p>
    </div>
  </motion.div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <DashboardApp />
    </ErrorBoundary>
  );
}

type Module = 'ANALISE DE CORTE' | 'MAPA DE OCUPAÇÃO' | 'INVENTARIO CÍCLICO' | 'INVENTARIO GERAL GIROTRADE';

const getTheme = (module: Module) => {
  switch (module) {
    case 'MAPA DE OCUPAÇÃO':
      return {
        primary: 'zinc',
        bg: 'bg-slate-300', 
        realBg: '#cbd5e1',
        sidebarBg: 'bg-white',
        contentBg: 'bg-[#313135]/72 backdrop-blur-md', 
        border: 'border-zinc-200',
        contentBorder: 'border-black border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.1)]', 
        active: 'bg-zinc-900 text-white shadow-2xl',
        hover: 'hover:bg-zinc-100',
        text: 'text-zinc-500',
        contentText: 'text-black', 
        contentTitle: 'text-white', 
        icon: 'text-zinc-500', 
        wave1: 'rgba(0,0,0,0.02)',
        wave2: 'rgba(0,0,0,0.01)',
        shadow: 'shadow-black/10',
        contentShadow: 'shadow-[0_0_30px_rgba(0,0,0,0.4)]',
        accent: 'text-white',
        logo: '#000000', 
        logoTop: '#ffffff', 
        headerTitle: 'text-white',
        headerText: 'text-zinc-400'
      };
    case 'INVENTARIO GERAL GIROTRADE':
      return {
        primary: 'blue',
        bg: 'bg-slate-300',
        realBg: '#cbd5e1',
        sidebarBg: 'bg-white',
        contentBg: 'bg-blue-600/70 backdrop-blur-md',
        border: 'border-blue-700',
        contentBorder: 'border-blue-900 border-4 shadow-[0_0_20px_rgba(59,130,246,0.4)]',
        active: 'bg-blue-800 text-white',
        hover: 'hover:bg-blue-50',
        text: 'text-slate-600',
        contentText: 'text-blue-50',
        contentTitle: 'text-white',
        icon: 'text-blue-600',
        wave1: 'rgba(37,99,235,0.02)',
        wave2: 'rgba(37,99,235,0.01)',
        shadow: 'shadow-blue-200/50',
        contentShadow: 'shadow-2xl shadow-blue-900/20',
        accent: 'text-blue-600',
        logo: '#3b82f6',
        logoTop: '#ffffff',
        headerTitle: 'text-blue-900',
        headerText: 'text-blue-700/60'
      };
    case 'ANALISE DE CORTE':
      return {
        primary: 'rose',
        bg: 'bg-slate-300',
        realBg: '#cbd5e1',
        sidebarBg: 'bg-white',
        contentBg: 'bg-white/70 backdrop-blur-md',
        border: 'border-rose-100',
        contentBorder: 'border-rose-50',
        active: 'bg-rose-600 text-white',
        hover: 'hover:bg-rose-50',
        text: 'text-slate-600',
        contentText: 'text-slate-700',
        contentTitle: 'text-slate-900',
        icon: 'text-rose-600',
        wave1: 'rgba(225,29,72,0.02)',
        wave2: 'rgba(225,29,72,0.01)',
        shadow: 'shadow-rose-200/50',
        contentShadow: 'shadow-sm',
        accent: 'text-rose-600',
        logo: '#e11d48',
        headerTitle: 'text-rose-900',
        headerText: 'text-rose-700/60'
      };
    default:
      return {
        primary: 'emerald',
        bg: 'bg-slate-300',
        realBg: '#cbd5e1',
        sidebarBg: 'bg-white',
        contentBg: 'bg-emerald-900/68 backdrop-blur-md',
        border: 'border-emerald-100',
        contentBorder: 'border-4 border-emerald-400',
        active: 'bg-emerald-600 text-white',
        hover: 'hover:bg-emerald-50',
        text: 'text-slate-600',
        contentText: 'text-emerald-50',
        contentTitle: 'text-white',
        icon: 'text-emerald-500',
        wave1: 'rgba(16,185,129,0.02)',
        wave2: 'rgba(16,185,129,0.01)',
        shadow: 'shadow-emerald-200/50',
        contentShadow: 'shadow-[0_0_20px_rgba(52,211,153,0.4)]',
        accent: 'text-emerald-600',
        logo: '#34d399', // Diferente verde (Emerald 400)
        logoTop: '#ffffff', // Branco para o arco superior
        headerTitle: 'text-black',
        headerText: 'text-black font-semibold opacity-90'
      };
  }
};

// --- Occupancy Components ---

const CollapsibleTableRow = ({ area, showStructure = false, showOccupied = false, showBlocked = false, showAvailable = false, theme }: { area: OccupancyMetric, showStructure?: boolean, showOccupied?: boolean, showBlocked?: boolean, showAvailable?: boolean, theme?: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSubcategories = area.subcategories && area.subcategories.length > 0;

  const isTotalCD = area.area.toUpperCase().includes('TOTAL CD');

  return (
    <>
        <tr className={cn(
          "transition-colors",
          !theme && "border-b border-slate-100",
          area.isCategory ? (theme ? "bg-zinc-900/50 font-bold" : "bg-slate-50 font-bold") : (theme ? theme.contentTitle : "text-slate-900"),
          isTotalCD && (theme ? "bg-zinc-800 border-t-2 border-zinc-700 text-white shadow-lg" : "bg-blue-50 border-t border-blue-200 text-blue-900")
        )}>
        <td className="py-3 px-4 flex items-center gap-2">
          {hasSubcategories ? (
            <button 
              onClick={() => setIsExpanded(!isExpanded)} 
              className={cn("transition-colors flex items-center gap-2 w-full text-left group", theme ? "text-blue-400 hover:text-blue-300" : "text-blue-400 hover:text-blue-300")}
            >
              <ChevronRight className={cn("w-4 h-4 transition-transform duration-200", isExpanded ? "rotate-90" : "")} />
              <span className={cn("text-xs uppercase tracking-wider group-hover:underline", theme ? (isTotalCD ? "text-white font-black" : theme.contentTitle) : "text-slate-900")}>{area.area}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 ml-6">
              <span className={cn("text-xs uppercase tracking-wider text-white", isTotalCD && "text-white font-black")}>{area.area}</span>
            </div>
          )}
        </td>
        {showStructure && (
          <>
            <td className={cn("py-3 px-4 text-right font-mono text-xs text-slate-600", isTotalCD && "text-white font-black")}>{(area.structure || 0).toLocaleString()}</td>
            <td className={cn("py-3 px-4 text-right font-mono text-xs text-slate-600", isTotalCD && "text-white font-black")}>{(area.addresses || 0).toLocaleString()}</td>
          </>
        )}
        {showOccupied && (
          <>
            <td className={cn("py-3 px-4 text-right font-mono text-xs text-slate-600", isTotalCD && "text-white font-black")}>
              {(area.occupied || 0).toLocaleString()}
            </td>
            <td className={cn("py-3 px-4 text-right font-mono text-xs text-amber-600 font-bold", isTotalCD && "text-yellow-200 font-black scale-110")}>
              {(area.percentage || 0).toFixed(1)}%
            </td>
          </>
        )}
        {showBlocked && (
          <td className={cn("py-3 px-4 text-right font-mono text-xs text-rose-400", isTotalCD && "font-black")}>
            {((area.definitivo || 0) + (area.operacional || 0)).toLocaleString()}
          </td>
        )}
        {showAvailable && (
          <td className={cn("py-3 px-4 text-right font-mono text-xs text-emerald-400", isTotalCD && "font-black")}>{(area.disponivel || 0).toLocaleString()}</td>
        )}
      </tr>
      {isExpanded && hasSubcategories && area.subcategories?.map(sub => (
        <tr key={sub.area} className={cn("italic transition-colors", !theme && "border-b border-slate-100", theme ? cn(theme.contentBorder, "bg-black/35") : "bg-slate-50/30")}>
          <td className="py-1 px-4 pl-12 text-[11px] text-yellow-400 font-black">{sub.area}</td>
          {showStructure && (
            <>
              <td className={cn("py-1 px-4 text-right font-mono text-[10px] text-yellow-400/80")}>{(sub.structure || 0).toLocaleString()}</td>
              <td className={cn("py-1 px-4 text-right font-mono text-[10px] text-yellow-400/80")}>{(sub.addresses || 0).toLocaleString()}</td>
            </>
          )}
          {showOccupied && (
            <>
              <td className={cn("py-1 px-4 text-right font-mono text-[10px] text-yellow-400/80")}>{(sub.occupied || 0).toLocaleString()}</td>
              <td className="py-1 px-4 text-right font-mono text-[10px] text-yellow-200">{(sub.percentage || 0).toFixed(1)}%</td>
            </>
          )}
          {showBlocked && (
            <td className="py-1 px-4 text-right font-mono text-[10px] text-rose-400">
              {((sub.definitivo || 0) + (sub.operacional || 0)).toLocaleString()}
            </td>
          )}
          {showAvailable && (
            <td className="py-1 px-4 text-right font-mono text-[10px] text-emerald-400">{(sub.disponivel || 0).toLocaleString()}</td>
          )}
        </tr>
      ))}
    </>
  );
};

const MiniMetric = ({ title, value, percentage, icon: Icon, color, theme }: { title: string, value: string, percentage?: string, icon: any, color: string, theme?: any }) => (
  <div className={cn("rounded-xl p-4 flex items-center justify-between shadow-sm transition-all duration-500", theme ? `${theme.contentBg} border-transparent ${theme.contentShadow}` : "bg-white border border-slate-100")}>
    <div className="flex items-center gap-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border", color, "border-transparent")}>
        <Icon className={cn("w-5 h-5", theme ? "text-black" : "text-white")} />
      </div>
      <div>
        <div className={cn("text-[9px] font-black uppercase tracking-widest mb-0.5", theme ? theme.contentText : "text-slate-400")}>{title}</div>
        <div className={cn("text-xl font-black font-mono leading-none", theme ? theme.contentTitle : "text-slate-900")}>{value}</div>
      </div>
    </div>
    {percentage && (
      <div className={cn("text-[10px] font-black", theme ? "text-amber-400" : "text-amber-600")}>{percentage}</div>
    )}
  </div>
);

const OccupancyCard = ({ title, areaName, subtitle, data, theme }: { title: string, areaName: string, subtitle: string, data: OccupancyData, theme?: any }) => {
  const area = data.areas.find(a => a.area.toUpperCase().includes(areaName.toUpperCase()));
  if (!area) return null;

  const filledCount = Math.floor(area.percentage / (100 / 6));
    let mainColor = theme ? "text-white" : "text-slate-900";
    if (!theme) {
      if (filledCount === 4) mainColor = "text-yellow-600";
      else if (filledCount === 5) mainColor = "text-orange-600";
      else if (filledCount >= 6) mainColor = "text-red-600";
    }

  return (
    <div className={cn("rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-white border-slate-100")}>
      <div className="p-8 text-center">
        <div className={cn("text-[11px] font-black uppercase tracking-[0.4em] mb-6", theme ? "text-black" : "text-slate-400")}>{title}</div>
        <div className={cn("text-8xl font-black mb-8 font-mono tracking-tighter", mainColor)}>
          {area.percentage.toFixed(1)}%
        </div>
        
        {/* Visual Representation of Levels */}
        <div className="flex justify-center mb-10">
          <div className={cn(
            "w-20 h-28 border-2 rounded-sm p-1 flex flex-col-reverse gap-1 transition-colors duration-500", 
            theme ? `border-zinc-700 bg-black/40` : "border-slate-100 bg-slate-50"
          )}>
            {[1, 2, 3, 4, 5, 6].map((lvl) => {
              const isFilled = (area.percentage / (100/6)) >= lvl;
              
              let barColor = theme ? "bg-white" : "bg-slate-900"; // Revertendo para barra branca sobre fundo preto sólido
              if (filledCount === 4) barColor = "bg-yellow-500";
              else if (filledCount === 5) barColor = "bg-orange-500";
              else if (filledCount >= 6) barColor = "bg-red-500";

              return (
                <div 
                  key={lvl} 
                  className={cn(
                    "flex-1 rounded-sm transition-all duration-1000",
                    isFilled ? barColor : (theme ? "bg-zinc-900/50" : "bg-white")
                  )}
                />
              );
            })}
          </div>
        </div>

        <div className={cn(
          "inline-flex items-center gap-2 px-5 py-2 rounded-full border transition-colors duration-500", 
          theme ? `border-zinc-700 bg-black/40` : "border-slate-100 bg-slate-50"
        )}>
          <div className={cn("w-2 h-2 rounded-full", theme ? "bg-zinc-100" : "bg-slate-900")} />
          <span className={cn("text-[9px] font-bold uppercase tracking-widest", theme ? "text-black" : "text-slate-500")}>{subtitle}</span>
        </div>
      </div>

      <div className={cn("mt-auto grid grid-cols-4 transition-all duration-500", theme ? `text-zinc-100 select-none` : "border-t border-slate-100 divide-x divide-slate-100 bg-slate-50/50")}>
        <div className="p-5 text-center">
          <div className={cn("text-[9px] font-bold uppercase tracking-widest mb-2", theme ? theme.contentText : "text-slate-400")}>Ocup.</div>
          <div className={cn("text-lg font-black font-mono leading-none", mainColor)}>{(area.occupied || 0).toLocaleString()}</div>
        </div>
        <div className="p-5 text-center">
          <div className={cn("text-[9px] font-bold uppercase tracking-widest mb-2", theme ? theme.contentText : "text-slate-400")}>Disp.</div>
          <div className={cn("text-lg font-black font-mono leading-none", theme ? "text-white" : "text-white")}>{(area.disponivel || 0).toLocaleString()}</div>
        </div>
        <div className="p-5 text-center">
          <div className={cn("text-[9px] font-bold uppercase tracking-widest mb-2", theme ? theme.contentText : "text-slate-400")}>Bloq.</div>
          <div className={cn("text-lg font-black font-mono leading-none", theme ? "text-white" : "text-white")}>{((area.definitivo || 0) + (area.operacional || 0)).toLocaleString()}</div>
        </div>
        <div className="p-5 text-center">
          <div className={cn("text-[9px] font-bold uppercase tracking-widest mb-2", theme ? theme.contentText : "text-slate-400")}>Total</div>
          <div className={cn("text-lg font-black font-mono leading-none", theme ? "text-white" : "text-slate-900")}>{(area.addresses || 0).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

const AlertCard = ({ sub, theme }: { sub: OccupancyMetric, theme?: any }) => {
  const percentage = sub.percentage;
  let statusColor = "text-slate-400";
  let barColor = "bg-slate-200";
  let cardBorder = theme ? "border-transparent" : "border-slate-100";
  let cardBg = theme ? theme.contentBg : "bg-white";
  let cardShadow = theme ? theme.contentShadow : "";
  
  if (percentage >= 90) {
    statusColor = "text-red-500";
    barColor = "bg-red-500";
    if (theme) {
      cardBorder = "border-red-500/40";
      cardShadow = "shadow-[0_0_20px_rgba(239,68,68,0.2)]";
    } else {
      cardBorder = "border-red-200";
      cardBg = "bg-red-50";
    }
  } else if (percentage >= 80) {
    statusColor = "text-orange-500";
    barColor = "bg-orange-500";
    if (theme) {
      cardBorder = "border-orange-500/40";
      cardShadow = "shadow-[0_0_20px_rgba(249,115,22,0.2)]";
    } else {
      cardBorder = "border-orange-200";
      cardBg = "bg-orange-50";
    }
  } else if (percentage >= 70) {
    statusColor = "text-yellow-500";
    barColor = "bg-yellow-500";
    if (theme) {
      cardBorder = "border-yellow-500/40";
      cardShadow = "shadow-[0_0_20px_rgba(234,179,8,0.2)]";
    } else {
      cardBorder = "border-yellow-200";
      cardBg = "bg-yellow-50";
    }
  }

  return (
    <div className={cn(
      "rounded-2xl p-6 transition-all duration-500 backdrop-blur-md flex flex-col space-y-6 border", 
      cardBg, 
      cardBorder, 
      cardShadow
    )}>
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h4 className={cn("text-[9px] font-black uppercase tracking-[0.2em]", theme ? "text-yellow-400" : "text-slate-400")}>{sub.area}</h4>
          <div className={cn("text-xl font-black font-mono", (percentage >= 70) ? statusColor : (theme ? theme.contentTitle : statusColor))}>{percentage.toFixed(1)}%</div>
        </div>
        <div className={cn("px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider", theme ? "bg-white/5 text-black" : "bg-slate-50 text-slate-500")}>
          {sub.occupied.toLocaleString()} / {sub.addresses.toLocaleString()}
        </div>
      </div>
      
      <div className={cn("h-1.5 w-full rounded-full overflow-hidden", theme ? "bg-zinc-800" : "bg-slate-100")}>
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percentage, 100)}%` }}
          className={cn("h-full transition-all duration-1000", barColor)} 
        />
      </div>
      
      <div className="grid grid-cols-4 gap-2">
        <div className={cn("rounded-xl p-3 text-center transition-colors duration-500", theme ? "bg-black/25" : "border border-slate-100 bg-slate-50/50")}>
          <div className={cn("text-[7px] uppercase font-black mb-1", theme ? "text-white" : "opacity-50")}>Total</div>
          <div className={cn("text-sm font-black", theme ? "text-white" : "text-slate-900")}>{sub.addresses.toLocaleString()}</div>
        </div>
        <div className={cn("rounded-xl p-3 text-center transition-colors duration-500", theme ? "bg-black/25" : "border border-slate-100 bg-slate-50/50")}>
          <div className={cn("text-[7px] uppercase font-black mb-1", theme ? "text-white" : "opacity-50")}>Ocup.</div>
          <div className="text-sm font-black text-orange-600">{sub.occupied.toLocaleString()}</div>
        </div>
        <div className={cn("rounded-xl p-3 text-center transition-colors duration-500", theme ? "bg-black/25" : "border border-slate-100 bg-slate-50/50")}>
          <div className={cn("text-[7px] uppercase font-black mb-1", theme ? "text-white" : "opacity-50")}>Bloq.</div>
          <div className="text-sm font-black text-rose-600">{(sub.definitivo + sub.operacional).toLocaleString()}</div>
        </div>
        <div className={cn("rounded-xl p-3 text-center transition-colors duration-500", theme ? "bg-black/25" : "border border-slate-100 bg-slate-50/50")}>
          <div className={cn("text-[7px] uppercase font-black mb-1", theme ? "text-white" : "opacity-50")}>Livre</div>
          <div className="text-sm font-black text-emerald-600">{sub.disponivel.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

const InventarioGeralView = ({ data, theme }: { data: InventarioGTData | undefined, theme: any }) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'fefo'>('geral');
  const [searchTerm, setSearchTerm] = useState('');
  
  if (!data) {
    return (
      <div className={cn("min-h-[400px] flex flex-col items-center justify-center p-12 text-center rounded-3xl border", theme.contentBg, theme.contentBorder)}>
        <FileSpreadsheet className="w-12 h-12 text-zinc-500 mb-4 animate-pulse" />
        <p className="text-zinc-500 font-medium">Dados do Inventário Geral não encontrados na planilha.</p>
        <p className="text-zinc-500 text-xs mt-2">Certifique-se de que a aba "INVENTARIO GT" existe na planilha vinculada.</p>
      </div>
    );
  }

  const filteredItems = data.items.filter(item => 
    item.sku.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const CategoryList = ({ category, color }: { category: 'FEFO' | 'PRÉ-FEFO' | 'PERDA', color: string }) => {
    const list = data.items
      .filter(item => item.category === category)
      .sort((a, b) => (a.daysRemaining || 999) - (b.daysRemaining || 999));

    return (
      <div className="w-full mt-6 bg-black/40 rounded-2xl overflow-hidden border border-white/20">
        <div className="overflow-y-auto max-h-[300px] custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className={cn("border-b border-white/20", theme.primary === 'blue' ? "bg-blue-800" : "bg-[#111]")}>
                <th className={cn("px-3 py-2 text-[8px] font-black uppercase tracking-widest", theme.primary === 'blue' ? "text-blue-100" : "text-zinc-500")}>SKU</th>
                <th className={cn("px-3 py-2 text-[8px] font-black uppercase tracking-widest text-right", theme.primary === 'blue' ? "text-blue-100" : "text-zinc-500")}>Vencimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {list.length > 0 ? (
                list.map((item, idx) => (
                  <tr key={`${item.sku}-${idx}`} className="hover:bg-white/5 transition-colors group">
                    <td className="px-3 py-2">
                      <div className={cn("text-[10px] font-bold font-mono leading-none", theme.contentTitle)}>{item.sku}</div>
                      <div className="text-[8px] text-zinc-500 truncate max-w-[150px] mt-0.5">{item.description}</div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className={cn("text-[10px] font-black font-mono", color)}>
                        {item.daysRemaining}d
                      </span>
                      <div className="text-[8px] text-zinc-500 font-black mt-0.5 opacity-80">
                        {item.expirationDate}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-wider">
                    Sem itens
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-black/20 rounded-2xl w-fit border border-white/10">
        <button
          onClick={() => setActiveTab('geral')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
            activeTab === 'geral' 
              ? theme.active 
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
          )}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('fefo')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
            activeTab === 'fefo' 
              ? theme.active 
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
          )}
        >
          Análise de FEFO
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'geral' ? (
          <motion.div 
            key="geral"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className={cn("p-8 rounded-3xl border shadow-xl flex flex-col items-center text-center transition-all", theme.contentBg, theme.contentBorder)}>
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border", theme.primary === 'blue' ? "bg-white/40 border-white/60" : "bg-blue-500/20 border-blue-500/40")}>
                  <Box className={cn("w-8 h-8", theme.primary === 'blue' ? "text-white" : "text-blue-500")} />
                </div>
                <h3 className={cn("text-xl font-bold mb-2", theme.contentTitle)}>TOTAL DE SKU´S</h3>
                <div className={cn("text-6xl font-black mb-2", theme.contentTitle)}>
                  {(data.uniqueSKUCount || 0).toLocaleString()}
                </div>
              </div>
              
              <div className={cn("p-8 rounded-3xl border shadow-xl flex flex-col items-center text-center transition-all lg:col-span-2", theme.contentBg, theme.contentBorder)}>
                 <div className="w-full flex flex-col md:flex-row justify-between items-center gap-6">
                   <div className="text-left">
                      <h2 className={cn("text-2xl font-black uppercase tracking-wider mb-1", theme.contentTitle)}>Análise de Itens</h2>
                      <p className={cn("text-xs font-medium", theme.primary === 'blue' ? "text-blue-100/60" : "text-zinc-500")}>Filtro por SKU ou Descrição para listagem detalhada.</p>
                   </div>
                   <div className="relative w-full max-w-sm">
                      <input 
                        type="text" 
                        placeholder="Pesquisar SKU ou Descrição..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={cn(
                          "w-full border rounded-xl px-5 py-3 text-sm focus:outline-none focus:ring-2 transition-all",
                          theme.primary === 'blue' 
                            ? "bg-white/20 border-white/40 text-white placeholder:text-white/60 ring-white/50" 
                            : "bg-black/40 border border-white/20 text-white ring-blue-500/50"
                        )}
                      />
                   </div>
                 </div>
              </div>
            </div>

            {/* Items Table */}
            <div className={cn("rounded-3xl border shadow-2xl overflow-hidden transition-all duration-500", theme.contentBg, theme.contentBorder)}>
              <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-20">
                    <tr className={cn("border-b transition-all duration-500", theme.primary === 'blue' ? "bg-blue-800 border-white/20" : "bg-[#111] border-white/15")}>
                      <th className={cn("px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]", theme.primary === 'blue' ? "text-blue-100" : "text-zinc-500")}>SKU</th>
                      <th className={cn("px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]", theme.primary === 'blue' ? "text-blue-100" : "text-zinc-500")}>Descrição do Produto</th>
                      <th className={cn("px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]", theme.primary === 'blue' ? "text-blue-100" : "text-zinc-500")}>Prazo de Validade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredItems.slice(0, 500).map((item, idx) => (
                      <tr key={`${item.sku}-${idx}`} className="hover:bg-white/5 transition-colors group">
                        <td className={cn("px-6 py-4 text-xs font-bold font-mono", theme.contentTitle)}>{item.sku}</td>
                        <td className={cn("px-6 py-4 text-xs font-medium group-hover:text-white transition-colors", theme.primary === 'blue' ? "text-blue-50" : "text-zinc-400")}>{item.description}</td>
                        <td className={cn("px-6 py-4 text-xs font-bold", theme.primary === 'blue' ? "text-white" : "text-orange-400")}>
                          {item.shelfLifeAL}
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 italic text-sm">
                          Nenhum item encontrado para a pesquisa.
                        </td>
                      </tr>
                    )}
                    {filteredItems.length > 500 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest bg-zinc-950/50">
                          Mostrando os primeiros 500 itens de {filteredItems.length}. Use a pesquisa para filtrar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="fefo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* FEFO Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={cn("p-6 rounded-3xl border shadow-xl flex flex-col items-center transition-all", theme.contentBg, theme.contentBorder)}>
                <div className="w-12 h-12 bg-amber-500/25 rounded-2xl flex items-center justify-center mb-4 border border-amber-500/40">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className={cn("text-xs font-black uppercase tracking-[0.2em] mb-1 text-center", theme.contentText)}>FEFO</h3>
                <p className="text-black text-[8px] mb-3 uppercase font-bold tracking-wider text-center">Vencimento entre 20 e 60 dias</p>
                <div className={cn("text-5xl font-black mb-1 text-center", theme.contentTitle)}>
                  {(data.fefoCount || 0).toLocaleString()}
                </div>
                <CategoryList category="FEFO" color="text-amber-500" />
              </div>

              <div className={cn("p-6 rounded-3xl border shadow-xl flex flex-col items-center transition-all", theme.contentBg, theme.contentBorder)}>
                <div className="w-12 h-12 bg-blue-500/25 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/40">
                  <Info className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className={cn("text-xs font-black uppercase tracking-[0.2em] mb-1 text-center", theme.contentText)}>PRÉ-FEFO</h3>
                <p className="text-black text-[8px] mb-3 uppercase font-bold tracking-wider text-center">Vencimento entre 61 e 70 dias</p>
                <div className={cn("text-5xl font-black mb-1 text-center", theme.contentTitle)}>
                  {(data.preFefoCount || 0).toLocaleString()}
                </div>
                <CategoryList category="PRÉ-FEFO" color="text-blue-500" />
              </div>

              <div className={cn("p-6 rounded-3xl border shadow-xl flex flex-col items-center transition-all", theme.contentBg, theme.contentBorder)}>
                <div className="w-12 h-12 bg-rose-500/25 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/40">
                  <AlertCircle className="w-6 h-6 text-rose-500 animate-pulse" />
                </div>
                <h3 className={cn("text-xs font-black uppercase tracking-[0.2em] mb-1 text-center", theme.contentText)}>PERDA</h3>
                <p className="text-black text-[8px] mb-3 uppercase font-bold tracking-wider text-center">Vencimento em menos de 20 dias</p>
                <div className={cn("text-5xl font-black mb-1 text-rose-500 text-center")}>
                  {(data.perdaCount || 0).toLocaleString()}
                </div>
                <CategoryList category="PERDA" color="text-rose-500" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const OccupancyDashboard = ({ data, theme, activeView }: { data?: OccupancyData, theme: any, activeView: 'dashboard' | 'analitico' }) => {
  const [alertView, setAlertView] = useState<'categoria' | 'geral'>('categoria');

  const globalSectors = React.useMemo(() => {
    if (!data) return [];
    const sectorsToSum = [
      { id: 'MERCEARIA SECA', label: 'Mercearia Seca' },
      { id: 'BAZAR, ELETRO E TEXTIL', label: 'Bazar, Eletro e Têxtil' },
      { id: 'BEBIDAS', label: 'Bebidas' },
      { id: 'HIGIENE, SAUDE E BELEZA', label: 'Higiene, Saúde e Beleza' },
      { id: 'LIMPEZA E LAVANDERIA', label: 'Limpeza e Lavanderia' },
      { id: 'FRACIONADO', label: 'Fracionados' },
      { id: 'CONFINADO', label: 'Confinados' },
      { id: 'AEROS', label: 'Aerosol' }
    ];

    const aggregated: Record<string, OccupancyMetric> = {};

    data.areas.forEach(area => {
      // Check subcategories first as they are usually the leaf nodes
      area.subcategories?.forEach(sub => {
        const normalizedSub = sub.area.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const match = sectorsToSum.find(s => normalizedSub.includes(s.id) || s.id.includes(normalizedSub));
        
        if (match) {
          if (!aggregated[match.id]) {
            aggregated[match.id] = {
              area: match.label,
              structure: 0,
              addresses: 0,
              occupied: 0,
              definitivo: 0,
              operacional: 0,
              disponivel: 0,
              percentage: 0,
              isCategory: false
            };
          }
          aggregated[match.id].structure += sub.structure;
          aggregated[match.id].addresses += sub.addresses;
          aggregated[match.id].occupied += sub.occupied;
          aggregated[match.id].definitivo += sub.definitivo;
          aggregated[match.id].operacional += sub.operacional;
          aggregated[match.id].disponivel += sub.disponivel;
        }
      });

      // Also check the area itself if it doesn't have subcategories (leaf area)
      if (!area.subcategories || area.subcategories.length === 0) {
        const normalizedArea = area.area.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const match = sectorsToSum.find(s => normalizedArea.includes(s.id) || s.id.includes(normalizedArea));
        
        if (match) {
          if (!aggregated[match.id]) {
            aggregated[match.id] = {
              area: match.label,
              structure: 0,
              addresses: 0,
              occupied: 0,
              definitivo: 0,
              operacional: 0,
              disponivel: 0,
              percentage: 0,
              isCategory: false
            };
          }
          aggregated[match.id].structure += area.structure;
          aggregated[match.id].addresses += area.addresses;
          aggregated[match.id].occupied += area.occupied;
          aggregated[match.id].definitivo += area.definitivo;
          aggregated[match.id].operacional += area.operacional;
          aggregated[match.id].disponivel += area.disponivel;
        }
      }
    });

    return Object.values(aggregated).map(item => ({
      ...item,
      percentage: item.addresses > 0 ? (item.occupied / item.addresses) * 100 : 0
    })).sort((a, b) => b.percentage - a.percentage);
  }, [data]);

  if (!data) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "min-h-[600px] flex flex-col items-center justify-center backdrop-blur-sm rounded-3xl border shadow-2xl p-12 text-center",
          theme.bg,
          theme.border
        )}
      >
        <div className={cn("w-24 h-24 rounded-3xl flex items-center justify-center mb-8 border", `bg-${theme.primary}-500/10`, `border-${theme.primary}-500/20`)}>
          <FileSpreadsheet className={cn("w-12 h-12 animate-pulse", theme.text)} />
        </div>
        <h2 className={cn("text-3xl font-bold mb-4 uppercase tracking-wider", theme.contentTitle)}>Mapa de Ocupação</h2>
        <p className={cn("max-w-md mx-auto leading-relaxed", theme.contentText)}>
          Nenhum dado de ocupação encontrado. Certifique-se de que a planilha possui a aba <span className={cn("font-bold", theme.contentText)}>"TABELA OCUPAÇÃO CD"</span> com os dados configurados.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <AnimatePresence mode="wait">
        {activeView === 'analitico' ? (
          <motion.div 
            key="analitico"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* 1. ESTRUTURA E ENDEREÇOS */}
            <div className={cn("rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-white border-slate-100")}>
              <div className={cn("p-5 border-b bg-gradient-to-r from-blue-500/25 to-transparent", theme ? theme.contentBorder : "border-slate-100")}>
                <h3 className={cn("text-xs font-black tracking-[0.3em] uppercase mb-1", theme ? theme.contentTitle : "text-slate-900")}>Estrutura & Endereços</h3>
                <p className={cn("text-[9px] uppercase tracking-widest font-medium", theme ? theme.contentText : "text-slate-500")}>Mapeamento por Posição e Setor</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn("text-[9px] uppercase tracking-[0.2em] border-b transition-all duration-500", theme ? "text-black border-slate-100 bg-slate-50/50" : "text-slate-400 border-slate-100 bg-slate-50")}>
                      <th className="py-3 px-4 font-bold text-black font-black">Posição / Setor (A)</th>
                      <th className="py-3 px-4 text-right font-bold text-black font-black">Estrutura (B)</th>
                      <th className="py-3 px-4 text-right font-bold text-black font-black">Endereços (C)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.areas.map(area => <CollapsibleTableRow key={area.area} area={area} showStructure theme={theme} />)}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. OCUPAÇÃO TOTAL */}
            <div className={cn("rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-white border-slate-100")}>
              <div className={cn("p-5 bg-gradient-to-r from-amber-500/25 to-transparent", !theme && "border-b border-slate-100")}>
                <h3 className={cn("text-xs font-black tracking-[0.3em] uppercase mb-1", theme ? theme.contentTitle : "text-slate-900")}>Ocupação Total</h3>
                <p className={cn("text-[9px] uppercase tracking-widest font-medium", theme ? theme.contentText : "text-slate-500")}>Status de Armazenagem</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn("text-[9px] uppercase tracking-[0.2em] transition-all duration-500", theme ? "text-black bg-slate-50/50" : "text-slate-400 border-b border-slate-100 bg-slate-50")}>
                      <th className="py-3 px-4 font-bold text-black font-black">Posição / Setor (A)</th>
                      <th className="py-3 px-4 text-right font-bold text-black font-black">Ocupado (D)</th>
                      <th className="py-3 px-4 text-right font-bold text-black font-black">% (H)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.areas.map(area => <CollapsibleTableRow key={area.area} area={area} showOccupied theme={theme} />)}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. CATEGORIAS BLOQUEADAS */}
            <div className={cn("rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-white border-slate-100")}>
              <div className={cn("p-5 bg-gradient-to-r from-rose-500/25 to-transparent", !theme && "border-b border-slate-100")}>
                <h3 className={cn("text-xs font-black tracking-[0.3em] uppercase mb-1", theme ? theme.contentTitle : "text-slate-900")}>Posições Bloqueadas</h3>
                <p className={cn("text-[9px] uppercase tracking-widest font-medium", theme ? theme.contentText : "text-slate-500")}>Definitivo & Operacional</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn("text-[9px] uppercase tracking-[0.2em] transition-all duration-500", theme ? "text-black bg-slate-50/50" : "text-slate-400 border-b border-slate-100 bg-slate-50")}>
                      <th className="py-3 px-4 font-bold text-black font-black">Posição / Setor (A)</th>
                      <th className="py-3 px-4 text-right font-bold text-black font-black">Total Bloqueado (E+F)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.areas.map(area => <CollapsibleTableRow key={area.area} area={area} showBlocked theme={theme} />)}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. ESPAÇO DISPONÍVEL */}
            <div className={cn("rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-white border-slate-100")}>
              <div className={cn("p-5 bg-gradient-to-r from-emerald-500/25 to-transparent", !theme && "border-b border-slate-100")}>
                <h3 className={cn("text-xs font-black tracking-[0.3em] uppercase mb-1", theme ? theme.contentTitle : "text-slate-900")}>Espaço Disponível</h3>
                <p className={cn("text-[9px] uppercase tracking-widest font-medium", theme ? theme.contentText : "text-slate-500")}>Capacidade Ociosa</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn("text-[9px] uppercase tracking-[0.2em] transition-all duration-500", theme ? "text-black bg-slate-50/50" : "text-slate-400 border-b border-slate-100 bg-slate-50")}>
                      <th className="py-3 px-4 font-bold text-black font-black">Posição / Setor (A)</th>
                      <th className="py-3 px-4 text-right font-bold text-black font-black">Disponível (G)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.areas.map(area => <CollapsibleTableRow key={area.area} area={area} showAvailable theme={theme} />)}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Top Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <MiniMetric title="Estrutura" value={data.totalStructure.toLocaleString()} icon={LayoutDashboard} color="bg-blue-500/20" theme={theme} />
              <MiniMetric title="Endereços" value={data.totalAddresses.toLocaleString()} icon={FileSpreadsheet} color="bg-zinc-500/20" theme={theme} />
              <MiniMetric title="Ocupado" value={data.totalOccupied.toLocaleString()} percentage={`${data.globalPercentage.toFixed(1)}%`} icon={TrendingUp} color="bg-orange-500/20" theme={theme} />
              <MiniMetric 
                title="Categorias Bloqueadas" 
                value={(data.totalDefinitivo + data.totalOperacional).toLocaleString()} 
                percentage={`${((data.totalDefinitivo + data.totalOperacional) / data.totalAddresses * 100).toFixed(1)}%`} 
                icon={AlertCircle} 
                color="bg-rose-500/20" 
                theme={theme}
              />
              <MiniMetric title="Disponível" value={data.totalDisponivel.toLocaleString()} percentage={`${(data.totalDisponivel / data.totalAddresses * 100).toFixed(1)}%`} icon={CheckCircle2} color="bg-emerald-500/20" theme={theme} />
            </div>

            {/* Main Content Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <OccupancyCard title="Picking" areaName="Picking" subtitle="Destaque: Nível 1" data={data} theme={theme} />
              <OccupancyCard title="Pulmão" areaName="Pulmão" subtitle="Destaque: Níveis 2 ao 6" data={data} theme={theme} />
            </div>

            {/* Alerta de Ocupação (Redesigned to match image) */}
            <div className={cn("rounded-2xl border shadow-2xl overflow-hidden flex flex-col p-6 space-y-8 transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder} ${theme.contentShadow}` : "bg-[#0f0f0f] border-white/20")}>
              {/* Header with Toggle and Legend */}
              <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", theme ? "bg-white/20" : "bg-white/20")}>
                      <Info className={cn("w-3.5 h-3.5", theme ? "text-white" : "text-white")} />
                    </div>
                    <h3 className={cn("text-xs font-black tracking-[0.2em] uppercase", theme ? theme.contentTitle : "text-white")}>Alerta de Ocupação</h3>
                  </div>
                  
                  <div className={cn("h-4 w-[1px] mx-2", theme ? "bg-white/20" : "bg-white/20")} />
                  
                  <div className={cn("p-1 rounded-lg flex items-center gap-1 border transition-all duration-500", theme ? `${theme.contentBg} ${theme.contentBorder}` : "bg-[#1a1a1a] border-white/5")}>
                    <button 
                      onClick={() => setAlertView('categoria')}
                      className={cn(
                        "px-4 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                        alertView === 'categoria' ? (theme ? "bg-zinc-950 text-white shadow-xl border border-white/20" : "bg-white text-zinc-950 shadow-lg") : "text-white/40 hover:text-white"
                      )}
                    >
                      Por Categoria
                    </button>
                    <button 
                      onClick={() => setAlertView('geral')}
                      className={cn(
                        "px-4 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                        alertView === 'geral' ? (theme ? "bg-zinc-950 text-white shadow-xl border border-white/20" : "bg-white text-zinc-950 shadow-lg") : "text-white/40 hover:text-white"
                      )}
                    >
                      Geral
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className={cn("text-[9px] font-black uppercase tracking-widest", theme.contentText)}>Crítico (≥90%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <span className={cn("text-[9px] font-black uppercase tracking-widest", theme.contentText)}>Alto (≥80%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className={cn("text-[9px] font-black uppercase tracking-widest", theme.contentText)}>Médio (≥70%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
                    <span className={cn("text-[9px] font-black uppercase tracking-widest", theme.contentText)}>Normal (&lt;70%)</span>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              {alertView === 'categoria' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {['PICKING', 'PICKING DUPLO', 'PULMAO'].map(areaName => {
                    const area = data.areas.find(a => 
                      a.area.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === areaName
                    );
                    
                    if (!area) return null;

                    return (
                      <div key={areaName} className="space-y-4">
                        <div className="flex justify-between items-center px-2">
                          <h4 className={cn("text-[11px] font-black uppercase tracking-[0.2em]", theme ? "text-white" : "text-white")}>{areaName}</h4>
                          <span className={cn("text-[8px] uppercase font-bold tracking-widest", theme ? "text-zinc-500" : "text-white/30")}>
                            {area.subcategories?.length || 0} itens
                          </span>
                        </div>
                        
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                          {[...(area.subcategories || [])]
                            .sort((a, b) => b.percentage - a.percentage)
                            .map((sub, idx) => (
                              <AlertCard key={idx} sub={sub} theme={theme} />
                            ))
                          }
                          
                          {(!area.subcategories || area.subcategories.length === 0) && (
                            <div className={cn("py-12 text-center rounded-xl border border-dashed", theme ? "bg-slate-50 border-slate-200" : "bg-white/15 border-white/20")}>
                              <p className={cn("text-[9px] uppercase font-bold tracking-widest", theme ? "text-slate-300" : "text-white/20")}>Nenhum subsetor encontrado</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {globalSectors.length > 0 ? (
                    globalSectors.map((sector, idx) => (
                      <AlertCard key={idx} sub={sector} theme={theme} />
                    ))
                  ) : (
                    <div className={cn("col-span-full py-20 text-center rounded-2xl border border-dashed", theme ? "bg-slate-50 border-slate-200" : "bg-white/15 border-white/20")}>
                      <p className={cn("text-xs uppercase font-black tracking-[0.3em]", theme ? "text-slate-300" : "text-white/20")}>Nenhum dado consolidado encontrado para os setores selecionados</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function DashboardApp() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [activeModule, setActiveModule] = useState<Module>('INVENTARIO CÍCLICO');
  const [activeTab, setActiveTab] = useState<'overview' | 'streets' | 'errors' | 'daily'>('overview');
  const [uploading, setUploading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [occupancyView, setOccupancyView] = useState<'dashboard' | 'analitico'>('analitico');

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1tnl6iGFhO87pd0wYPnmOVoCSXJp10xwvSqagHrwTr-s/export?format=xlsx';

  const isAdmin = true;

  const processWorkbook = useCallback(async (wb: XLSX.WorkBook) => {
    const mainSheetName = wb.SheetNames.find(n => 
      n.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("CONTAGEM_CICLICA_1_GIRO")
    ) || wb.SheetNames[0];
    const ws = wb.Sheets[mainSheetName];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Process "DIARIO" sheet for daily metrics
    const dailySheetName = wb.SheetNames.find(n => 
      n.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "DIARIO"
    );
    const dailySheet = dailySheetName ? wb.Sheets[dailySheetName] : null;
    
    let dailyCount = 0;
    let monthlyCount = 0;
    let weeklyGoal = 0;
    let dailyHistory: DailyHistory[] = [];
    let weeklyHistory: WeeklyHistory[] = [];

    if (dailySheet) {
      const dailyData: any[][] = XLSX.utils.sheet_to_json(dailySheet, { header: 1 });
      
      const sheetWeeklyGoal = Number(dailyData[1]?.[12]) || 0;
      if (sheetWeeklyGoal > 0) weeklyGoal = sheetWeeklyGoal;

      let lastValidCount = 0;

      for (let i = 1; i < dailyData.length; i++) {
        const row = dailyData[i];
        if (!row || !row[0]) continue;

        const dateVal = row[0];
        const count = Number(row[2]) || 0;

        monthlyCount += count;

        let date: Date | null = null;
        if (typeof dateVal === 'number') {
          date = new Date(Math.round((dateVal - 25569) * 86400 * 1000) + (12 * 60 * 60 * 1000));
        } else if (typeof dateVal === 'string') {
          const parts = dateVal.split('/');
          if (parts.length === 3) {
            date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
          } else {
            date = new Date(dateVal);
          }
        }

        if (date && !isNaN(date.getTime())) {
          const dayNameCalculated = date.toLocaleDateString('pt-BR', { weekday: 'long' });
          const formattedDayName = dayNameCalculated.charAt(0).toUpperCase() + dayNameCalculated.slice(1);

          const isSunday = date.getDay() === 0 || formattedDayName.toLowerCase().includes('domingo');
          
          if (!isSunday) {
            dailyHistory.push({
              date: date.toLocaleDateString('pt-BR'),
              dayName: formattedDayName,
              count: count
            });
            
            if (count > 0) {
              lastValidCount = count;
            }
          }
        }
      }
      dailyCount = lastValidCount;

      const weeks: { [key: string]: { count: number, start: number, end: number } } = {
        "Semana 1": { count: 0, start: 1, end: 7 },
        "Semana 2": { count: 0, start: 8, end: 14 },
        "Semana 3": { count: 0, start: 15, end: 21 },
        "Semana 4": { count: 0, start: 22, end: 31 }
      };

      dailyHistory.forEach(item => {
        const parts = item.date.split('/');
        const day = Number(parts[0]);
        
        let weekKey = "Semana 4";
        if (day <= 7) weekKey = "Semana 1";
        else if (day <= 14) weekKey = "Semana 2";
        else if (day <= 21) weekKey = "Semana 3";
        
        weeks[weekKey].count += item.count;
      });

      weeklyHistory = Object.entries(weeks)
        .map(([weekName, data]) => ({
          weekRange: `${weekName} (Dia ${data.start} ao ${data.end})`,
          count: data.count
        }));
    }

    const metrics: DashboardMetrics = {
      totalPositions: 0,
      totalCounted: 0,
      totalPending: 0,
      accuracy: 0,
      finalAccuracy: 0,
      totalErrors: 0,
      surplus: 0,
      shortage: 0,
      finalizedDivergences: 0,
      generalStatus: 0,
      dailyCount,
      monthlyCount,
      weeklyGoal,
      dailyGoal: 0,
      weeklyGoalCalculated: 0,
      dailyHistory,
      weeklyHistory,
      collaboratorCounts: [],
      streets: [],
      occupancyData: {
        totalStructure: 0,
        totalAddresses: 0,
        totalOccupied: 0,
        totalDefinitivo: 0,
        totalOperacional: 0,
        totalDisponivel: 0,
        globalPercentage: 0,
        areas: []
      }
    };

    // Process "Tabela Ocupação CD" sheet
    const occupancySheetName = wb.SheetNames.find(n => 
      n.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("TABELA OCUPACAO CD")
    ) || wb.SheetNames.find(n => 
      n.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("OCUPACAO CD")
    );
    
    if (occupancySheetName) {
      const occSheet = wb.Sheets[occupancySheetName];
      const occData: any[][] = XLSX.utils.sheet_to_json(occSheet, { header: 1 });
      
      const areas: OccupancyMetric[] = [];
      let totalStructure = 0;
      let totalAddresses = 0;
      let totalOccupied = 0;
      let totalDefinitivo = 0;
      let totalOperacional = 0;
      let totalDisponivel = 0;
      
      let currentCategory: OccupancyMetric | null = null;
      let subtotalMetric: OccupancyMetric | null = null;
      const TOP_LEVEL_POSITIONS = [
        'PICKING', 
        'PICKING DUPLO', 
        'FRACIONADO', 
        'PULMAO', 
        'TUNEL', 
        'SEGURANCA/INFRA', 
        'SEGURANCA / INFRA',
        'SUBTOTAL', 
        'TOTAL CD'
      ];

      for (let i = 0; i < occData.length; i++) {
        const row = occData[i];
        if (!row) continue;
        
        const rawAreaName = String(row[0] || '').trim();
        if (!rawAreaName && !row[1] && !row[2]) continue;

        const areaName = rawAreaName;
        const structure = Number(row[1]) || 0;
        const addresses = Number(row[2]) || 0;
        const occupied = Number(row[3]) || 0;
        const definitivo = Number(row[4]) || 0;
        const operacional = Number(row[5]) || 0;
        const disponivel = Number(row[6]) || 0;
        let percentage = Number(row[7]);
        
        if (isNaN(percentage)) {
          percentage = addresses > 0 ? (occupied / addresses) * 100 : 0;
        } else if (percentage <= 1 && percentage > 0) {
          percentage = percentage * 100;
        }

        // Normalize for comparison
        const normalizedName = areaName.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // A row is a category if:
        // 1. It's in our explicit list of top-level positions (normalized)
        // 2. It's all uppercase AND contains letters AND is NOT "FRACIONADOS" (plural, which is a sector under PULMÃO)
        const isCategory = TOP_LEVEL_POSITIONS.includes(normalizedName) || 
                          normalizedName === "FRACIONADO" ||
                          (areaName === areaName.toUpperCase() && /[A-Z]/.test(areaName) && normalizedName !== "FRACIONADOS");
        
        const isSummary = normalizedName.includes("TOTAL") || normalizedName.includes("SUBTOTAL");
        
        const metric: OccupancyMetric = {
          area: areaName || 'Sem Nome',
          structure,
          addresses,
          occupied,
          definitivo,
          operacional,
          disponivel,
          percentage,
          isCategory,
          ...(isCategory ? { subcategories: [] } : {})
        };

        if (isCategory) {
          areas.push(metric);
          currentCategory = metric;
          
          if (normalizedName === 'SUBTOTAL') {
            subtotalMetric = metric;
          }

          // Only sum "real" positions for the grand total
          if (!isSummary && normalizedName !== 'TOTAL CD') {
            totalStructure += structure;
            totalAddresses += addresses;
            totalOccupied += occupied;
            totalDefinitivo += definitivo;
            totalOperacional += operacional;
            totalDisponivel += disponivel;
          }
        } else if (currentCategory && areaName) {
          currentCategory.subcategories?.push(metric);
        }
      }
      
      // Sync TOTAL CD with SUBTOTAL if TOTAL CD is empty (as requested by user)
      const totalCdRow = areas.find(a => a.area.toUpperCase().includes('TOTAL CD'));
      if (totalCdRow && subtotalMetric) {
        if (totalCdRow.structure === 0) totalCdRow.structure = subtotalMetric.structure;
        if (totalCdRow.addresses === 0) totalCdRow.addresses = subtotalMetric.addresses;
        if (totalCdRow.occupied === 0) totalCdRow.occupied = subtotalMetric.occupied;
        if (totalCdRow.definitivo === 0) totalCdRow.definitivo = subtotalMetric.definitivo;
        if (totalCdRow.operacional === 0) totalCdRow.operacional = subtotalMetric.operacional;
        if (totalCdRow.disponivel === 0) totalCdRow.disponivel = subtotalMetric.disponivel;
        if (totalCdRow.percentage === 0) totalCdRow.percentage = subtotalMetric.percentage;
      }

      // Final global totals sync
      if (totalStructure === 0 && totalCdRow) {
        totalStructure = totalCdRow.structure;
        totalAddresses = totalCdRow.addresses;
        totalOccupied = totalCdRow.occupied;
        totalDefinitivo = totalCdRow.definitivo;
        totalOperacional = totalCdRow.operacional;
        totalDisponivel = totalCdRow.disponivel;
      } else if (subtotalMetric) {
        // If we have a subtotal, ensure global totals match it if they were calculated as 0
        if (totalStructure === 0) totalStructure = subtotalMetric.structure;
        if (totalAddresses === 0) totalAddresses = subtotalMetric.addresses;
        if (totalOccupied === 0) totalOccupied = subtotalMetric.occupied;
        if (totalDefinitivo === 0) totalDefinitivo = subtotalMetric.definitivo;
        if (totalOperacional === 0) totalOperacional = subtotalMetric.operacional;
        if (totalDisponivel === 0) totalDisponivel = subtotalMetric.disponivel;
      }

      metrics.occupancyData = {
        totalStructure,
        totalAddresses,
        totalOccupied,
        totalDefinitivo,
        totalOperacional,
        totalDisponivel,
        globalPercentage: totalAddresses > 0 ? (totalOccupied / totalAddresses) * 100 : 0,
        areas
      };
    }

    // Helper to parse dates from spreadsheet
    const parseSheetDate = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return value;
      
      const str = String(value).trim();
      if (!str || str === 'N/A') return null;

      const dateParts = str.split('/');
      if (dateParts.length === 3) {
        const d = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10) - 1;
        const y = parseInt(dateParts[2], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date;
      }

      const serial = Number(value);
      if (!isNaN(serial) && serial > 25569) {
        const date = new Date((serial - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) return date;
      }

      return null;
    };

    // Process "INVENTARIO GT" sheet
    const inventarioGTSheetName = wb.SheetNames.find(n => 
      n.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("INVENTARIO GT")
    );
    
    if (inventarioGTSheetName) {
      const gtSheet = wb.Sheets[inventarioGTSheetName];
      const gtData: any[][] = XLSX.utils.sheet_to_json(gtSheet, { header: 1 });
      
      const items: InventarioGTSKU[] = [];
      const uniqueSKUsSet = new Set<string>();
      let fefoCount = 0;
      let preFefoCount = 0;
      let perdaCount = 0;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      for (let i = 1; i < gtData.length; i++) {
        const row = gtData[i];
        if (!row || row.length < 11) continue;
        
        const sku = String(row[10] || '').trim(); // Col K
        if (!sku) continue;
        
        const description = String(row[12] || '').trim(); // Col M
        const area = String(row[2] || '').trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Col C
        const estado = String(row[4] || '').trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Col E
        const shelfLifeAL = row[37] !== undefined && row[37] !== null ? row[37] : 'N/A'; // Col AL
        
        // Expiration date (Col BQ - Index 68) - get raw value from sheet
        let expirationDate = 'N/A';
        const rawDate = row[68];
        
        let daysRemaining: number | null = null;
        let category: 'FEFO' | 'PRÉ-FEFO' | 'PERDA' | 'NORMAL' = 'NORMAL';

        const expDate = parseSheetDate(rawDate);
        if (expDate) {
          // Format as DD/MM/YY
          const d = String(expDate.getDate()).padStart(2, '0');
          const m = String(expDate.getMonth() + 1).padStart(2, '0');
          const y = String(expDate.getFullYear()).slice(-2);
          expirationDate = `${d}/${m}/${y}`;

          const diffTime = expDate.getTime() - now.getTime();
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          // FEFO/PRÉ-FEFO/PERDA rules only apply if Estado is NORMAL and Area is PICKING or PULMAO
          const isRuleApplicable = estado === 'NORMAL' && (area === 'PICKING' || area === 'PULMAO');

          if (isRuleApplicable) {
            if (daysRemaining < 20) {
              category = 'PERDA';
              perdaCount++;
            } else if (daysRemaining <= 60) {
              category = 'FEFO';
              fefoCount++;
            } else if (daysRemaining <= 70) {
              category = 'PRÉ-FEFO';
              preFefoCount++;
            }
          }
        } else if (rawDate !== undefined && rawDate !== null) {
          expirationDate = String(rawDate).trim();
        }

        if (!uniqueSKUsSet.has(sku)) {
          uniqueSKUsSet.add(sku);
          items.push({
            sku,
            description,
            expirationDate,
            shelfLifeAL,
            daysRemaining,
            category
          });
        }
      }
      
      metrics.inventarioGT = {
        items,
        uniqueSKUCount: uniqueSKUsSet.size,
        fefoCount,
        preFefoCount,
        perdaCount
      };
    }

    const row6 = jsonData[5] || [];
    const totalPositions = Number(row6[8]) || 0;
    metrics.totalPositions = totalPositions;
    metrics.totalCounted = Number(row6[9]) || 0;
    metrics.totalPending = Number(row6[10]) || 0;
    metrics.accuracy = (Number(row6[21]) || 0) * 100;
    metrics.finalAccuracy = (Number(row6[23]) || 0) * 100;
    metrics.totalErrors = Number(row6[17]) || 0;
    metrics.surplus = Number(row6[14]) || 0;
    metrics.shortage = Number(row6[15]) || 0;
    metrics.finalizedDivergences = Number(row6[18]) || 0;
    metrics.generalStatus = (Number(row6[19]) || 0) * 100;
    metrics.dailyGoal = Math.round(totalPositions / 26);
    metrics.weeklyGoalCalculated = Math.round(totalPositions / 4);

    const nameRow = jsonData[3] || [];
    const valueRow = jsonData[4] || [];
    const collaboratorCounts: CollaboratorCount[] = [];
    
    for (let col = 26; col <= 29; col++) {
      const name = nameRow[col];
      const value = Number(valueRow[col]) || 0;
      if (name) {
        collaboratorCounts.push({ name: String(name), count: value });
      }
    }
    metrics.collaboratorCounts = collaboratorCounts;

    for (let i = 0; i < 18; i++) {
      const rowIndex = 8 + (i * 6);
      const row = jsonData[rowIndex] || [];
      
      let streetErrors = 0;
      let streetSurplus = 0;
      let streetShortage = 0;
      let streetFinalized = 0;
      for (let j = 0; j < 6; j++) {
        const subRow = jsonData[rowIndex + j] || [];
        streetErrors += Math.abs(Number(subRow[17]) || 0);
        streetSurplus += Math.abs(Number(subRow[14]) || 0);
        streetShortage += Math.abs(Number(subRow[15]) || 0);
        streetFinalized += Number(subRow[18]) || 0;
      }
      
      const plan = Math.abs(Number(row[5]) || 0); 
      const counted = Number(row[6]) || 0; 
      const pending = counted - plan; 
      const status = plan > 0 ? (counted / plan) * 100 : 0;

      metrics.streets.push({
        id: i + 1,
        name: `Rua ${i + 1}`,
        plan: plan,
        counted: counted,
        pending: pending,
        status: status,
        errors: streetErrors,
        surplus: streetSurplus,
        shortage: streetShortage,
        finalized: streetFinalized
      });
    }

    return metrics;
  }, []);

  const syncGoogleSheets = useCallback(async () => {
    if (!isAdmin) return;
    
    setUploading(true);
    try {
      const response = await fetch(SPREADSHEET_URL);
      if (!response.ok) throw new Error('Falha ao buscar dados do Google Sheets. Verifique se a planilha está pública.');
      
      const arrayBuffer = await response.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const metrics = await processWorkbook(wb);
      const nowIso = new Date().toISOString();

      // Keep the dashboard usable even if Firestore write is blocked.
      setData({
        ...metrics,
        updatedAt: nowIso,
        updatedBy: 'Google Sheets Sync'
      });

      const docRef = doc(db, 'dashboard', 'latest');
      await setDoc(docRef, {
        ...metrics,
        updatedAt: nowIso,
        updatedBy: 'Google Sheets Sync'
      });
      
      setLastSync(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
      // Don't throw to avoid breaking the UI, but log it
    } finally {
      setUploading(false);
    }
  }, [isAdmin, processWorkbook]);

  useEffect(() => {
    const docRef = doc(db, 'dashboard', 'latest');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setData(docSnap.data() as DashboardMetrics);
      }
    }, (error) => {
      // Read can fail without auth; dashboard now uses direct Sheets sync as fallback.
      console.warn('Firestore read unavailable, using Google Sheets sync only:', error);
    });

    return () => unsubscribe();
  }, []);

  // Periodic Sync (every 30 seconds if admin is logged in)
  useEffect(() => {
    if (isAdmin) {
      syncGoogleSheets();
      const interval = setInterval(syncGoogleSheets, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, syncGoogleSheets]);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full p-12 rounded-3xl border border-slate-200 bg-white flex flex-col items-center text-center shadow-xl"
        >
          <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20">
            <RefreshCw className={cn("w-10 h-10 text-emerald-600", uploading && "animate-spin")} />
          </div>
          <h1 className="text-3xl font-bold text-slate-950 mb-2">Contagem Cíclica</h1>
          <p className="text-slate-600 mb-8 max-w-sm">
            {uploading 
              ? "Sincronizando dados com a planilha Google Sheets..." 
              : "Aguardando sincronização inicial dos dados."}
          </p>
        </motion.div>
      </div>
    );
  }

  const filteredStreets = data.streets;

  const chartData = data.streets.map(s => ({
    name: s.name,
    Plano: s.plan,
    Contado: s.counted,
    Pendente: s.pending,
    Erros: s.errors,
    Sobra: s.surplus,
    Falta: s.shortage,
    Finalizadas: s.finalized
  }));

  const pieData = [
    { name: 'Contado', value: data.totalCounted, color: '#4f46e5' },
    { name: 'Pendente', value: data.totalPending, color: '#f43f5e' },
  ];

  const theme = getTheme(activeModule);

  const modules: { name: Module, icon: any }[] = [
    { name: 'INVENTARIO CÍCLICO', icon: LayoutDashboard },
    { name: 'MAPA DE OCUPAÇÃO', icon: Box },
    { name: 'INVENTARIO GERAL GIROTRADE', icon: Box },
    { name: 'ANALISE DE CORTE', icon: Scissors }
  ];

  return (
    <div 
      className={cn("min-h-screen flex flex-row font-sans relative overflow-hidden transition-colors duration-500", theme.bg)}
      style={{
        ['--bg-color' as any]: theme.realBg || '#ffffff',
        ['--wave-1-url' as any]: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 300'%3E%3Cpath fill='${encodeURIComponent(theme.wave1)}' d='M0,150 C150,50 350,250 500,150 C650,50 850,250 1000,150 L1000,300 L0,300 Z'/%3E%3C/svg%3E")`,
        ['--wave-2-url' as any]: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 300'%3E%3Cpath fill='${encodeURIComponent(theme.wave2)}' d='M0,150 C150,250 350,50 500,150 C650,250 850,50 1000,150 L1000,300 L0,300 Z'/%3E%3C/svg%3E")`
      }}
    >
      {/* Sidebar */}
      <aside className={cn("w-64 backdrop-blur-md border-r flex flex-col z-10 shadow-2xl transition-colors duration-500", theme.sidebarBg, theme.border)}>
        <div className={cn("p-6 border-b", theme.border)}>
          <div className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-lg", theme.active)}>
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <span className={cn("font-bold tracking-wider text-sm uppercase", theme.accent)}>Menu Dashboard</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <div className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-4 px-2", theme.text)}>
            Relatórios & Filtros
          </div>
          {modules.map((m) => (
            <button
              key={m.name}
              onClick={() => setActiveModule(m.name)}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl text-[11px] font-bold transition-all duration-300 flex items-center gap-3 group",
                activeModule === m.name 
                  ? `${theme.active} text-white shadow-lg ${theme.shadow}` 
                  : cn("text-slate-400 hover:bg-slate-100 hover:text-slate-900")
              )}
            >
              <m.icon className={cn(
                "w-4 h-4 transition-all duration-300",
                activeModule === m.name ? "text-white" : "text-slate-300 group-hover:text-slate-600"
              )} />
              {m.name}
            </button>
          ))}
        </nav>

        <div className={cn("p-4 border-t", theme.border)}>
          <div className={cn("rounded-xl p-4 border", `bg-${theme.primary}-50/50`, theme.border)}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", `bg-${theme.primary}-500`)} />
              <span className={cn("text-[10px] font-bold uppercase tracking-widest", theme.text)}>Status Sistema</span>
            </div>
            <p className={cn("text-[9px] leading-relaxed", theme.text, "opacity-60")}>
              Sincronização ativa com Google Sheets. Atualização a cada 30s.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Moving Waves Background */}
        <div className="wave-container">
          <div className="wave wave-1"></div>
          <div className="wave wave-2"></div>
        </div>

        {/* Centered background logo, same symbol as header */}
        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
          <div className="w-[96vw] max-w-[1550px] aspect-square opacity-[0.34]">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <path
                d="M 15 45 A 16 16 0 0 1 47 45"
                fill="none"
                stroke="rgba(15,23,42,0.42)"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 15 45 A 16 16 0 0 1 47 45"
                fill="none"
                stroke={theme.logoTop || "#ffffff"}
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M 32 55 A 16 16 0 0 0 64 55"
                fill="none"
                stroke="rgba(15,23,42,0.26)"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 32 55 A 16 16 0 0 0 64 55"
                fill="none"
                stroke={theme.logo}
                strokeWidth="12"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-y-auto p-4 md:p-8 bg-transparent">
        <div className="max-w-7xl mx-auto">
          {activeModule === 'INVENTARIO CÍCLICO' ? (
            <>
              <div className={cn("flex flex-col md:flex-row justify-between items-center md:items-start mb-10 backdrop-blur-sm p-6 rounded-3xl border gap-6 md:gap-0 transition-colors duration-500", theme.contentBg, theme.contentBorder, theme.contentShadow)}>
            {/* Logo Area - Now Transparent */}
            <div className="flex items-center gap-0">
            <div className="w-20 h-16 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Top Curve - White */}
                <path 
                  d="M 15 45 A 16 16 0 0 1 47 45" 
                  fill="none" 
                  stroke={theme.logoTop || "#334155"} 
                  strokeWidth="12" 
                  strokeLinecap="round"
                />
                {/* Bottom Curve - Green */}
                <path 
                  d="M 32 55 A 16 16 0 0 0 64 55" 
                  fill="none" 
                  stroke={theme.logo} 
                  strokeWidth="12" 
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex flex-col -ml-6">
              <span className={cn("text-[32px] font-bold leading-[0.8] lowercase tracking-tight", theme.contentTitle)}>giro</span>
              <span className={cn("text-[32px] font-bold leading-[0.8] lowercase tracking-tight ml-[12px]", theme.contentText)}>trade</span>
            </div>
          </div>

          {/* Central Header */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden sm:flex flex-col items-center justify-center flex-1 px-4 mt-1"
          >
            <div className="relative">
              <h1 className={cn("text-xl md:text-2xl lg:text-3xl font-black tracking-[0.15em] uppercase leading-none", theme.contentTitle)}>
                Inventário <span className={theme.contentText}>Cíclico</span>
              </h1>
              <div className="absolute -bottom-3 left-0 right-0 flex items-center justify-center gap-3">
                <div className={cn("hidden md:block h-[2px] w-8 lg:w-12 bg-gradient-to-r from-transparent", `to-${theme.primary}-500/20`)}></div>
                <span className={cn("text-[7px] md:text-[9px] font-black uppercase tracking-[0.4em] whitespace-nowrap opacity-60", theme.contentText)}>
                  Performance & Acuracidade
                </span>
                <div className={cn("hidden md:block h-[2px] w-8 lg:w-12 bg-gradient-to-l from-transparent", `to-${theme.primary}-500/20`)}></div>
              </div>
            </div>
          </motion.div>

          {/* Signature and Actions */}
          <div className="flex flex-col items-end gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900 tracking-tight">Created by Thiago.Henrique</span>
              <span className={cn("text-[10px] font-medium uppercase tracking-widest", `${theme.contentText}/70`)}>junior inventory analyst</span>
              {data.updatedAt && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Clock className={cn("w-3 h-3", `text-slate-400`)} />
                  <span className={cn("text-[9px] font-medium uppercase tracking-wider", `text-slate-400`)}>
                    Atualizado em: {new Date(data.updatedAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className={cn("flex items-center gap-2 px-3 py-1.5 border rounded-lg", `bg-${theme.primary}-500/5`, `border-${theme.primary}-500/10`)}>
                <div className={cn("w-1.5 h-1.5 rounded-full", `bg-${theme.primary}-500`, uploading ? "animate-ping" : "animate-pulse")} />
                <span className={cn("text-[10px] font-bold uppercase tracking-widest", theme.contentText)}>
                  {uploading ? "Sincronizando..." : "Live Sync"}
                </span>
              </div>
              <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-lg", theme.active, theme.shadow)}>
                Dashboard Liberado
              </div>
            </div>
          </div>
        </div>

        <header className="mb-8 text-center">
          <div className="mb-6">
            <h2 className={cn("text-4xl font-bold drop-shadow-sm", theme.headerTitle || theme.contentTitle)}>{activeModule === 'INVENTARIO CÍCLICO' ? 'Planejamento Cíclico' : activeModule}</h2>
            <p className={cn("font-medium", theme.headerText || theme.contentText)}>Acompanhamento em tempo real da performance operacional.</p>
          </div>
          
          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-end justify-center gap-4">
            <nav className={cn("flex flex-wrap gap-2 p-1 backdrop-blur-[2px] rounded-2xl border w-fit shadow-sm", theme.contentBg, theme.contentBorder)}>
              <button 
                onClick={() => setActiveTab('overview')}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                  activeTab === 'overview' ? `${theme.active} text-black shadow-lg ${theme.shadow}` : "text-black/60 hover:text-black hover:bg-slate-50"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                Visão Geral
              </button>
              <button 
                onClick={() => setActiveTab('streets')}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                  activeTab === 'streets' ? `${theme.active} text-black shadow-lg ${theme.shadow}` : "text-black/60 hover:text-black hover:bg-slate-50"
                )}
              >
                <Map className="w-4 h-4" />
                Detalhes por Rua
              </button>
              <button 
                onClick={() => setActiveTab('errors')}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                  activeTab === 'errors' ? `${theme.active} text-black shadow-lg ${theme.shadow}` : "text-black/60 hover:text-black hover:bg-slate-50"
                )}
              >
                <AlertCircle className="w-4 h-4" />
                Análise de Erros
              </button>
              <button 
                onClick={() => setActiveTab('daily')}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                  activeTab === 'daily' ? `${theme.active} text-black shadow-lg ${theme.shadow}` : "text-black/60 hover:text-black hover:bg-slate-50"
                )}
              >
                <Clock className="w-4 h-4" />
                Contagem Diária
              </button>
            </nav>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="space-y-8"
            >
              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard 
                  title="Total de Posições" 
                  value={data.totalPositions} 
                  icon={LayoutDashboard} 
                  color="bg-emerald-800"
                  subtitle="Plano"
                  theme={theme}
                />
                <MetricCard 
                  title="Posições Contadas" 
                  value={data.totalCounted} 
                  icon={CheckCircle2} 
                  color="bg-emerald-600"
                  subtitle={`${((data.totalCounted / data.totalPositions) * 100).toFixed(2)}%`}
                  theme={theme}
                />
                <MetricCard 
                  title="Pendentes" 
                  value={data.totalPending} 
                  icon={Clock} 
                  color="bg-emerald-700"
                  subtitle={`${((data.totalPending / data.totalPositions) * 100).toFixed(2)}%`}
                  theme={theme}
                />
                <MetricCard 
                  title="Acuracidade" 
                  value={`${data.accuracy.toFixed(2)}%`} 
                  icon={TrendingUp} 
                  color="bg-emerald-500"
                  subtitle="Meta: 99,5%"
                  theme={theme}
                />
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={cn("lg:col-span-2 backdrop-blur-[2px] p-6 rounded-2xl border shadow-sm transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <h3 className={cn("text-lg font-bold mb-6", theme.contentTitle)}>Progresso por Rua</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barGap={-16}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#111', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.4)' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Legend iconType="circle" />
                        <Bar name="Plano" dataKey="Plano" fill="#ffffff" opacity={0.1} barSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        <Bar name="Contado" dataKey="Contado" fill="#4ade80" barSize={16} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={cn("backdrop-blur-[2px] p-6 rounded-2xl border shadow-sm flex flex-col transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <h3 className={cn("text-lg font-bold mb-6", theme.contentTitle)}>Status Geral</h3>
                  <div className="flex-1 flex items-center justify-center relative">
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className={cn("text-3xl font-bold", theme.contentTitle)}>{data.generalStatus.toFixed(1)}%</span>
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Concluído</span>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : 'rgba(0,0,0,0.05)'} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#000' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3 mt-4">
                    {pieData.map((item, index) => (
                      <div key={item.name} className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: index === 0 ? '#ffffff' : 'rgba(255,255,255,0.2)' }} />
                          <span className="text-sm text-white/60">{item.name}</span>
                        </div>
                        <span className={cn("text-sm font-bold", theme.contentTitle)}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'streets' && (
            <motion.div 
              key="streets"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn("backdrop-blur-[2px] rounded-2xl border shadow-lg overflow-hidden transition-all duration-500", theme.contentBg, theme.contentBorder)}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b transition-all duration-500 bg-white/5 border-white/10">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">Rua</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">Plano (Fixo)</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">Contado</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">Pendente</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">Status (%)</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">Progresso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y transition-all duration-500 divide-white/5">
                    {filteredStreets.map((street) => (
                      <tr key={street.id} className="transition-colors group hover:bg-white/5">
                        <td className={cn("px-6 py-4 font-medium text-white")}>{street.name}</td>
                        <td className="px-6 py-4 text-white/40">{street.plan}</td>
                        <td className="px-6 py-4 font-semibold text-white">{street.counted}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-xs font-bold",
                            street.pending < 0 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                          )}>
                            {street.pending}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400">
                          {street.status.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 w-48">
                          <div className="w-full h-2 rounded-full overflow-hidden bg-white/20">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(street.status, 100)}%` }}
                              className={cn(
                                "h-full transition-all",
                                street.status >= 100 ? "bg-emerald-400" : "bg-emerald-500"
                              )}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'errors' && (
            <motion.div 
              key="errors"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className={cn("backdrop-blur-[2px] p-8 rounded-3xl border shadow-lg flex flex-col items-center text-center transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                    <AlertCircle className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={cn("text-xl font-bold mb-2", theme.contentTitle)}>Total de Erros</h3>
                  <p className="text-white/40 mb-6 font-medium">Soma total de divergências (Sobra e Falta) identificadas na contagem.</p>
                  <div className="text-5xl font-black text-white mb-2">
                    {data.totalErrors}
                  </div>
                  <div className="flex gap-4 mb-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white/40 uppercase">Sobra (+)</span>
                      <span className="text-lg font-bold text-emerald-400">{data.surplus}</span>
                    </div>
                    <div className="w-px h-8 bg-white/20 self-center" />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white/40 uppercase">Falta (-)</span>
                      <span className="text-lg font-bold text-rose-400">{data.shortage}</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-widest">Unidades Totais</span>
                </div>

                <div className={cn("backdrop-blur-[2px] p-8 rounded-3xl border shadow-lg flex flex-col items-center text-center transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                    <CheckCircle2 className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={cn("text-xl font-bold mb-2", theme.contentTitle)}>Divergências Finalizadas</h3>
                  <p className="text-white/40 mb-6 font-medium">Quantidade de divergências que já foram tratadas e concluídas.</p>
                  <div className="text-5xl font-black text-white mb-2">
                    {data.finalizedDivergences}
                  </div>
                </div>

                <div className={cn("backdrop-blur-[2px] p-8 rounded-3xl border shadow-lg flex flex-col items-center text-center transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                    <TrendingUp className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={cn("text-xl font-bold mb-2", theme.contentTitle)}>Acuracidade Final</h3>
                  <p className="text-white/40 mb-6 font-medium">Percentual após analise das Divergências</p>
                  <div className="text-5xl font-black text-white mb-2">
                    {data.finalAccuracy.toFixed(2)}%
                  </div>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-widest">Precisão</span>
                </div>
              </div>

              <div className={cn("backdrop-blur-[2px] p-6 rounded-2xl border shadow-lg transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                <h3 className={cn("text-lg font-bold mb-6", theme.contentTitle)}>Análise de Divergência por Rua</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="Erros" stroke="#f43f5e" strokeWidth={3} dot={{ r: 6, fill: '#f43f5e' }} activeDot={{ r: 8 }} />
                      <Line type="monotone" dataKey="Finalizadas" stroke="#10b981" strokeWidth={3} dot={{ r: 6, fill: '#10b981' }} activeDot={{ r: 8 }} />
                      <Line type="monotone" dataKey="Sobra" name="Quantidade para mais (+)" stroke="#10b981" hide legendType="none" />
                      <Line type="monotone" dataKey="Falta" name="Quantidade para menos (-)" stroke="#fb7185" hide legendType="none" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'daily' && (
            <motion.div 
              key="daily"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className={cn("backdrop-blur-[2px] p-8 rounded-3xl border shadow-lg flex flex-col items-center text-center opacity-80 transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                    <TrendingUp className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={cn("text-xl font-bold mb-2", theme.contentTitle)}>Meta Semanal</h3>
                  <p className="text-white/40 mb-6 font-medium">Objetivo de contagem semanal (Meta Mês / 4).</p>
                  <div className="text-5xl font-black text-white mb-2">
                    {data.weeklyGoalCalculated || 2852}
                  </div>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-widest">Unidades</span>
                </div>

                <div className={cn("backdrop-blur-[2px] p-10 rounded-3xl border-4 shadow-2xl flex flex-col items-center text-center transform scale-105 z-10 transition-all duration-500", theme.contentBg, "border-white/20")}>
                  <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-6 border border-white/40">
                    <Clock className="w-10 h-10 text-white" />
                  </div>
                  <h3 className={cn("text-2xl font-bold mb-2", theme.contentTitle)}>Meta Diária</h3>
                  <p className="text-white/40 mb-6 font-medium">Meta calculada por dia útil (26 dias).</p>
                  <div className="text-6xl font-black text-white mb-2">
                    {data.dailyGoal || 439}
                  </div>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-widest">Posições / Dia</span>
                </div>

                <div className={cn("backdrop-blur-[2px] p-8 rounded-3xl border shadow-lg flex flex-col items-center text-center opacity-80 transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                  <div className="w-16 h-16 bg-white/25 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                    <FileSpreadsheet className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={cn("text-xl font-bold mb-2", theme.contentTitle)}>Meta Mês</h3>
                  <p className="text-white/40 mb-6 font-medium">Quantidade total de posições.</p>
                  <div className="text-5xl font-black text-white mb-2">
                    {data.totalPositions || 11408}
                  </div>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-wider mb-6">Total Posições</span>
                  
                  {/* Summary inside Meta Mês */}
                  <div className={cn("w-full pt-6 border-t flex justify-center gap-10", "border-white/20")}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Contado</span>
                      <span className="text-2xl font-bold text-emerald-400">{data.totalCounted}</span>
                    </div>
                    <div className={cn("w-px h-10 self-center", "bg-white/20")} />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Falta</span>
                      <span className="text-2xl font-bold text-rose-400">{data.totalPending}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collaborator Count Section */}
              <div className={cn("backdrop-blur-[2px] p-6 rounded-2xl border shadow-lg overflow-hidden transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className={cn("text-lg font-bold", theme.contentTitle)}>CONTAGEM POR COLABORADOR</h3>
                  <span className="text-xs text-slate-400 uppercase tracking-widest">Desempenho Individual</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.collaboratorCounts && data.collaboratorCounts.length > 0 ? (
                    data.collaboratorCounts.map((collab, idx) => (
                      <motion.div 
                        key={idx} 
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                        className={cn("p-4 rounded-xl border flex flex-col items-center text-center relative overflow-hidden group transition-all", theme.contentBorder)}
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">{collab.name}</span>
                        <span className="text-2xl font-black text-white">{collab.count.toLocaleString('pt-BR')}</span>
                        <span className="text-[10px] text-white/20 uppercase font-medium">Unidades Contadas</span>
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-full py-4 text-center text-slate-300 italic">
                      Nenhum dado de colaborador disponível.
                    </div>
                  )}
                </div>
              </div>

              {/* History Table */}
              <div className={cn("backdrop-blur-[2px] p-6 rounded-2xl border shadow-lg overflow-hidden transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className={cn("text-lg font-bold", theme.contentTitle)}>Histórico de Contagem (Mês atual)</h3>
                  <span className="text-xs text-slate-400 uppercase tracking-widest">Excluindo Domingos</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b transition-all duration-500 bg-white/15 border-white/20">
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Data</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Dia</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Contada</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Previsão</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Atingimento (%)</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Status vs Meta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y transition-all duration-500 divide-white/20">
                      {(() => {
                        let accumulatedDeficit = 0;
                        return data.dailyHistory && data.dailyHistory.length > 0 ? (
                          data.dailyHistory.map((item, idx) => {
                            const dailyGoal = data.dailyGoal || 439;
                            
                            // Meta total para hoje = Meta do dia + O que sobrou de ontem
                            const dailyTarget = Math.round(dailyGoal + accumulatedDeficit);
                            
                            // Atingimento referente à meta acumulada (Meta do dia + Déficit anterior)
                            const percentage = dailyTarget > 0 ? (item.count / dailyTarget) * 100 : 100;
                            
                            // Previsão (Saldo para amanhã) = Meta de Hoje + Saldo de Ontem - Contado Hoje
                            const remaining = Math.round(dailyTarget - item.count);
                            
                            // Atualiza o acumulado para a próxima iteração
                            accumulatedDeficit = remaining;

                            let statusColor = "text-emerald-400";
                            let statusBg = "bg-emerald-500/10";
                            let statusText = "Meta Atingida";

                            if (percentage < 50) {
                              statusColor = "text-rose-400";
                              statusBg = "bg-rose-500/20";
                              statusText = "Crítico (<50%)";
                            } else if (percentage < 75) {
                              statusColor = "text-amber-400";
                              statusBg = "bg-amber-500/20";
                              statusText = "Abaixo (50-75%)";
                            } else if (percentage < 100) {
                              statusColor = "text-emerald-400 font-bold";
                              statusBg = "bg-emerald-500/10";
                              statusText = "Próximo (>75%)";
                            }

                            return (
                              <tr 
                                key={idx} 
                                className={cn(
                                  "transition-colors duration-150 border-l-4",
                                  percentage >= 100 
                                    ? "bg-white/20 border-l-emerald-500 hover:bg-white/30"
                                    : "hover:bg-white/10 border-l-transparent"
                                )}
                              >
                                <td className={cn("px-4 py-3 text-sm font-bold text-white")}>{item.date}</td>
                                <td className="px-4 py-3 text-sm text-white/40">{item.dayName}</td>
                                <td className={cn("px-4 py-3 text-sm font-bold text-white")}>{item.count}</td>
                                <td className="px-4 py-3 text-sm text-emerald-400 font-bold">{remaining}</td>
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    "text-sm font-bold",
                                    statusColor
                                  )}>
                                    {percentage.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                                    statusBg,
                                    statusColor
                                  )}>
                                    {statusText}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-300 italic">
                              Nenhum dado de histórico disponível. Faça o upload da planilha com a aba "DIARIO".
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Weekly History Table */}
              <div className={cn("backdrop-blur-[2px] p-6 rounded-2xl border shadow-lg overflow-hidden transition-all duration-500", theme.contentBg, theme.contentBorder)}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className={cn("text-lg font-bold", theme.contentTitle)}>Histórico de Contagem Semanal</h3>
                  <span className="text-xs text-white/40 uppercase tracking-widest">Agrupado por Período</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b transition-all duration-500 bg-white/15 border-white/20">
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Semana</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Contada</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Previsão</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Atingimento (%)</th>
                        <th className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/40">Status vs Meta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y transition-all duration-500 divide-white/20">
                      {(() => {
                        let accumulatedWeeklyDeficit = 0;
                        return data.weeklyHistory && data.weeklyHistory.length > 0 ? (
                          data.weeklyHistory.map((item, idx) => {
                            const weeklyGoal = data.weeklyGoalCalculated || 2852;
                            
                            // Meta total para esta semana = Meta da semana + O que sobrou da anterior
                            const weeklyTarget = Math.round(weeklyGoal + accumulatedWeeklyDeficit);
                            
                            // Atingimento referente à meta acumulada (Meta da semana + Déficit anterior)
                            const percentage = weeklyTarget > 0 ? (item.count / weeklyTarget) * 100 : 100;
                            
                            // Previsão (Saldo para próxima semana) = Meta de Hoje + Saldo de Ontem - Contado Hoje
                            const remaining = Math.round(weeklyTarget - item.count);
                            
                            // Atualiza o acumulado para a próxima iteração
                            accumulatedWeeklyDeficit = remaining;

                            let statusColor = "text-emerald-400";
                            let statusBg = "bg-emerald-500/10";
                            let statusText = "Meta Atingida";

                            if (percentage < 50) {
                              statusColor = "text-rose-400";
                              statusBg = "bg-rose-500/20";
                              statusText = "Crítico (<50%)";
                            } else if (percentage < 75) {
                              statusColor = "text-amber-400";
                              statusBg = "bg-amber-500/20";
                              statusText = "Abaixo (50-75%)";
                            } else if (percentage < 100) {
                              statusColor = "text-emerald-400 font-bold";
                              statusBg = "bg-emerald-500/10";
                              statusText = "Próximo (>75%)";
                            }

                            return (
                              <tr 
                                key={idx} 
                                className={cn(
                                  "transition-colors duration-150 border-l-4",
                                  percentage >= 100 
                                    ? "bg-white/20 border-l-emerald-500 hover:bg-white/30"
                                    : "hover:bg-white/10 border-l-transparent"
                                )}
                              >
                                <td className={cn("px-4 py-3 text-sm font-bold text-white")}>{item.weekRange}</td>
                                <td className={cn("px-4 py-3 text-sm font-bold text-white")}>{item.count}</td>
                                <td className="px-4 py-3 text-sm text-emerald-400 font-bold">{remaining}</td>
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    "text-sm font-bold",
                                    statusColor
                                  )}>
                                    {percentage.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                                    statusBg,
                                    statusColor
                                  )}>
                                    {statusText}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-300 italic">
                              Nenhum dado de histórico semanal disponível.
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
            </>
          ) : activeModule === 'MAPA DE OCUPAÇÃO' ? (
            <>
              <div className={cn("flex flex-col md:flex-row justify-between items-center md:items-start mb-10 backdrop-blur-sm p-6 rounded-3xl border gap-6 md:gap-0 transition-colors duration-500", theme.contentBg, theme.contentBorder, theme.contentShadow)}>
        <div className="flex items-center gap-0">
          <div className="w-20 h-16 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <path d="M 15 45 A 16 16 0 0 1 47 45" fill="none" stroke={theme.logoTop || "#334155"} strokeWidth="12" strokeLinecap="round" />
              <path d="M 32 55 A 16 16 0 0 0 64 55" fill="none" stroke={theme.logo} strokeWidth="12" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex flex-col -ml-6">
            <span className={cn("text-[32px] font-bold leading-[0.8] lowercase tracking-tight", theme.headerTitle || theme.contentTitle)}>giro</span>
            <span className={cn("text-[32px] font-bold leading-[0.8] lowercase tracking-tight ml-[12px]", theme.headerText || theme.contentText)}>trade</span>
          </div>
        </div>
                
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="hidden sm:flex flex-col items-center justify-center flex-1 px-4 mt-1"
                >
                  <div className="relative">
                    <h1 className={cn("text-xl md:text-2xl lg:text-3xl font-black tracking-[0.15em] uppercase leading-none text-center", theme.headerTitle || theme.contentTitle)}>
                      Ocupação <span className={(!theme || theme.bg.includes('zinc-950') || theme.bg.includes('black') || theme.contentBg.includes('#18181b') || theme.contentBg.includes('#0a0a0a')) ? "text-white/40" : "text-black/20"}>CD</span>
                    </h1>
                    <div className="absolute -bottom-3 left-0 right-0 flex items-center justify-center gap-3">
                      <div className={cn("hidden md:block h-[2px] w-8 lg:w-12 bg-gradient-to-r from-transparent", (!theme || theme.bg.includes('zinc-950') || theme.bg.includes('black') || theme.contentBg.includes('#18181b') || theme.contentBg.includes('#0a0a0a')) ? "to-white/20" : "to-black/5")}></div>
                      <span className={cn("text-[7px] md:text-[9px] font-black uppercase tracking-[0.4em] whitespace-nowrap", (!theme || theme.bg.includes('zinc-950') || theme.bg.includes('black') || theme.contentBg.includes('#18181b') || theme.contentBg.includes('#0a0a0a')) ? "text-white/40" : "text-black/30")}>
                        Performance & Ocupação
                      </span>
                      <div className={cn("hidden md:block h-[2px] w-8 lg:w-12 bg-gradient-to-l from-transparent", (!theme || theme.bg.includes('zinc-950') || theme.bg.includes('black') || theme.contentBg.includes('#18181b') || theme.contentBg.includes('#0a0a0a')) ? "to-white/20" : "to-black/5")}></div>
                    </div>
                  </div>
                </motion.div>

                <div className="flex items-center gap-6">
                  <div className="text-right hidden lg:block">
                    <div className={cn("text-[8px] font-bold uppercase tracking-widest", (!theme || theme.bg.includes('zinc-950') || theme.bg.includes('black') || theme.contentBg.includes('#18181b') || theme.contentBg.includes('#0a0a0a')) ? "text-white/40" : "text-black/20")}>Created By</div>
                    <div className={cn("text-xs font-black uppercase tracking-tighter leading-none", (!theme || theme.bg.includes('zinc-950') || theme.bg.includes('black') || theme.contentBg.includes('#18181b') || theme.contentBg.includes('#0a0a0a')) ? "text-white" : "text-black")}>Thiago Rodrigues</div>
                    <div className={cn("text-[8px] font-bold uppercase tracking-[0.2em] mt-1", theme ? (theme.headerText || theme.contentText) : "text-slate-500")}>Inventory Analyst</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="p-2 rounded-lg bg-white/10 border border-white/20 text-white/60 hover:text-white transition-colors">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-black text-emerald-400 uppercase tracking-widest font-sans">
                      Acesso Direto
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Navigation at Top */}
              <div className="flex justify-center mb-10 sticky top-0 z-40 py-2">
                <div className={cn("backdrop-blur-md border rounded-2xl p-1 shadow-xl flex items-center gap-1", theme.contentBg, theme.contentBorder)}>
                  <button 
                    onClick={() => setOccupancyView('dashboard')}
                    className={cn(
                      "px-10 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      occupancyView === 'dashboard' ? `${theme.active} text-white shadow-lg` : "text-white/40 hover:text-white"
                    )}
                  >
                    Visão Analítica
                  </button>
                  <button 
                    onClick={() => setOccupancyView('analitico')}
                    className={cn(
                      "px-10 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      occupancyView === 'analitico' ? `${theme.active} text-white shadow-lg` : "text-white/40 hover:text-white"
                    )}
                  >
                    Visão Geral
                  </button>
                </div>
              </div>

              <OccupancyDashboard data={data?.occupancyData} theme={theme} activeView={occupancyView} />
            </>
          ) : (
            <>
              <div className={cn("flex flex-col md:flex-row justify-between items-center md:items-start mb-10 backdrop-blur-sm p-6 rounded-3xl border gap-6 md:gap-0 transition-colors duration-500", theme.contentBg, theme.contentBorder, theme.contentShadow)}>
                <div className="flex items-center gap-0">
                  <div className="w-20 h-16 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <path d="M 15 45 A 16 16 0 0 1 47 45" fill="none" stroke={theme.logoTop || "#334155"} strokeWidth="12" strokeLinecap="round" />
                      <path d="M 32 55 A 16 16 0 0 0 64 55" fill="none" stroke={theme.logo} strokeWidth="12" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex flex-col -ml-6">
                    <span className={cn("text-[32px] font-bold leading-[0.8] lowercase tracking-tight", theme.contentTitle)}>giro</span>
                    <span className={cn("text-[32px] font-bold leading-[0.8] lowercase tracking-tight ml-[12px]", theme.contentText)}>trade</span>
                  </div>
                </div>
                
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="hidden sm:flex flex-col items-center justify-center flex-1 px-4 mt-1"
                >
                  <div className="relative">
                    <h1 className={cn("text-xl md:text-2xl lg:text-3xl font-black tracking-[0.15em] uppercase leading-none text-center", theme.contentTitle)}>
                      {activeModule === 'ANALISE DE CORTE' ? 'Análise de' : 'Inventário'} <span className={theme.contentText}>{activeModule === 'ANALISE DE CORTE' ? 'Corte' : 'Geral'}</span>
                    </h1>
                    <div className="absolute -bottom-3 left-0 right-0 flex items-center justify-center gap-3">
                      <div className={cn("hidden md:block h-[2px] w-8 lg:w-12 bg-gradient-to-r from-transparent", "to-white/20")}></div>
                      <span className={cn("text-[7px] md:text-[9px] font-black uppercase tracking-[0.4em] whitespace-nowrap opacity-60", theme.contentText)}>
                        Performance & Girotrade
                      </span>
                      <div className={cn("hidden md:block h-[2px] w-8 lg:w-12 bg-gradient-to-l from-transparent", "to-white/20")}></div>
                    </div>
                  </div>
                </motion.div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-black text-emerald-400 uppercase tracking-widest font-sans">
                      Acesso Direto
                    </div>
                  </div>
                </div>
              </div>

              {activeModule === 'INVENTARIO GERAL GIROTRADE' ? (
                <InventarioGeralView data={data?.inventarioGT} theme={theme} />
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn("min-h-[600px] flex flex-col items-center justify-center backdrop-blur-sm rounded-3xl border p-12 text-center transition-colors duration-500", theme.contentBg, theme.contentBorder, theme.contentShadow)}
                >
                  <div className={cn("w-24 h-24 rounded-3xl flex items-center justify-center mb-8 border", `bg-${theme.primary}-500/10`, `border-${theme.primary}-500/20`)}>
                    <Clock className={cn("w-12 h-12 animate-pulse", theme.contentText)} />
                  </div>
                  <h2 className={cn("text-3xl font-bold mb-4 uppercase tracking-wider", theme.contentTitle)}>{activeModule}</h2>
                  <p className="text-white/40 max-w-md mx-auto leading-relaxed">
                    Este módulo está sendo preparado para integração com os dados da sua planilha. 
                    Em breve, você poderá visualizar a <span className={cn("font-bold", theme.contentText)}>{activeModule.toLowerCase()}</span> em tempo real.
                  </p>
                  <button 
                    onClick={() => setActiveModule('INVENTARIO CÍCLICO')}
                    className={cn("mt-10 px-8 py-3 text-white rounded-xl font-bold transition-all shadow-lg text-xs uppercase tracking-widest", theme.active, theme.shadow)}
                  >
                    Voltar para Inventário Cíclico
                  </button>
                </motion.div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  </div>
);
}
