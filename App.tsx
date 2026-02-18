
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PlusCircle, Trash2, PieChart as ChartIcon, List, BrainCircuit, Wallet, TrendingDown, TrendingUp, AlertTriangle, Info, Bookmark, X, Sparkles, FileUp, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Transaction, Category, AIAnalysis } from './types';
import { getFinancialInsights, extractTransactionsFromFile } from './services/geminiService';

const CATEGORIES: Category[] = ['Alimentación', 'Transporte', 'Vivienda', 'Entretenimiento', 'Salud', 'Educación', 'Otros'];
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [recurringDescs, setRecurringDescs] = useState<string[]>(() => {
    const saved = localStorage.getItem('recurring_descs');
    return saved ? JSON.parse(saved) : [];
  });

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('Otros');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [isRecurring, setIsRecurring] = useState(false);
  
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para el Modal de Duplicados
  const [duplicateModal, setDuplicateModal] = useState<{
    show: boolean,
    type: 'exact' | 'partial' | null,
    pendingData: Transaction | null
  }>({ show: false, type: null, pendingData: null });

  useEffect(() => {
    localStorage.setItem('transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('recurring_descs', JSON.stringify(recurringDescs));
  }, [recurringDescs]);

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    return { income, expenses, balance: income - expenses };
  }, [transactions]);

  const chartData = useMemo(() => {
    return CATEGORIES.map(cat => ({
      name: cat,
      value: transactions
        .filter(t => t.category === cat && t.type === 'expense')
        .reduce((acc, t) => acc + t.amount, 0)
    })).filter(d => d.value > 0);
  }, [transactions]);

  const normalizeText = (text: string) => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, "") 
      .toLowerCase()
      .trim();
  };

  const playClickSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) { console.error(e); }
  };

  const processAddition = (data: Transaction) => {
    playClickSound();
    setTransactions(prev => [data, ...prev]);
    
    const normalizedNew = normalizeText(data.description);
    const existsInRecurring = recurringDescs.some(d => normalizeText(d) === normalizedNew);
    
    if (isRecurring && !existsInRecurring) {
      setRecurringDescs(prev => [...prev, data.description]);
    }
    
    setDescription('');
    setAmount('');
    setIsRecurring(false);
    setDuplicateModal({ show: false, type: null, pendingData: null });
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      description: description.trim(),
      amount: parseFloat(amount),
      category,
      type,
      date: new Date().toISOString().split('T')[0]
    };

    const normalizedNewDesc = normalizeText(newTransaction.description);

    const exactMatch = transactions.find(t => 
      normalizeText(t.description) === normalizedNewDesc && 
      t.amount === newTransaction.amount
    );

    const descMatch = transactions.find(t => 
      normalizeText(t.description) === normalizedNewDesc && 
      t.amount !== newTransaction.amount
    );

    if (exactMatch) {
      setDuplicateModal({ show: true, type: 'exact', pendingData: newTransaction });
    } else if (descMatch) {
      setDuplicateModal({ show: true, type: 'partial', pendingData: newTransaction });
    } else {
      processAddition(newTransaction);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportSuccess(false);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64WithPrefix = event.target?.result as string;
        const base64Data = base64WithPrefix.split(',')[1];
        
        const extracted = await extractTransactionsFromFile(base64Data, file.type);
        
        if (extracted.length > 0) {
          const newTransactions: Transaction[] = extracted.map(t => ({
            id: crypto.randomUUID(),
            description: t.description || 'Sin descripción',
            amount: t.amount || 0,
            category: (t.category as Category) || 'Otros',
            type: (t.type as 'income' | 'expense') || 'expense',
            date: t.date || new Date().toISOString().split('T')[0]
          }));
          
          setTransactions(prev => [...newTransactions, ...prev]);
          setImportSuccess(true);
          setTimeout(() => setImportSuccess(false), 3000);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error importing file:", error);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteTransaction = (id: string) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const runAiAnalysis = async () => {
    if (transactions.length === 0) return;
    setIsAnalyzing(true);
    try {
      const insights = await getFinancialInsights(transactions);
      setAiAnalysis(insights);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeRecurring = (desc: string) => {
    setRecurringDescs(recurringDescs.filter(d => d !== desc));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {duplicateModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 scale-in-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
              duplicateModal.type === 'exact' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
            }`}>
              {duplicateModal.type === 'exact' ? <AlertTriangle size={32} /> : <Info size={32} />}
            </div>
            <h3 className="text-center text-xl font-bold text-slate-800 mb-2">
              {duplicateModal.type === 'exact' ? '¿Duplicado Detectado?' : 'Descripción Repetida'}
            </h3>
            <p className="text-center text-slate-500 text-sm mb-8 leading-relaxed">
              {duplicateModal.type === 'exact' 
                ? `Ya existe un registro similar a "${duplicateModal.pendingData?.description}" por ${duplicateModal.pendingData?.amount}€. ¿Seguro que quieres añadirlo otra vez?`
                : `Ya tienes gastos guardados bajo un nombre similar a "${duplicateModal.pendingData?.description}", pero con un importe diferente. ¿Quieres continuar?`}
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => duplicateModal.pendingData && processAddition(duplicateModal.pendingData)}
                className={`w-full py-3.5 rounded-2xl font-bold text-white transition-all active:scale-95 ${
                  duplicateModal.type === 'exact' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Añadir de todos modos
              </button>
              <button 
                onClick={() => setDuplicateModal({ show: false, type: null, pendingData: null })}
                className="w-full py-3.5 rounded-2xl font-bold text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <Wallet className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">FinanceWise</h1>
          </div>
          
          <div className="relative group">
            <button 
              onClick={runAiAnalysis}
              disabled={isAnalyzing || transactions.length === 0}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 text-sm font-bold shadow-lg
                ${isAnalyzing 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white hover:shadow-indigo-500/25 hover:scale-105 active:scale-95 ring-2 ring-indigo-500/20'
                }
              `}
            >
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  <span>Analizando...</span>
                </div>
              ) : (
                <>
                  <Sparkles size={18} className={`${transactions.length > 0 ? 'animate-pulse' : ''}`} />
                  <span>IA Insights</span>
                </>
              )}
            </button>
            
            {!isAnalyzing && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-slate-900 text-white text-[11px] p-3 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 pointer-events-none transform translate-y-1 group-hover:translate-y-0">
                <div className="absolute -top-1 right-8 w-2 h-2 bg-slate-900 rotate-45"></div>
                <div className="flex items-start gap-2">
                  <BrainCircuit size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <span className="font-bold text-indigo-300">Potenciado por Gemini AI:</span> Analiza tus patrones de gasto para detectar fugas de dinero y obtener consejos de ahorro personalizados en segundos.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-slate-500 text-sm font-medium">Balance Total</p>
            <h2 className={`text-3xl font-bold mt-1 ${totals.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {totals.balance.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </h2>
            <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-50 p-2 rounded-full"><TrendingUp className="text-emerald-500" size={16} /></div>
                <div><p className="text-xs text-slate-400">Ingresos</p><p className="font-semibold text-emerald-600">+{totals.income}€</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-rose-50 p-2 rounded-full"><TrendingDown className="text-rose-500" size={16} /></div>
                <div><p className="text-xs text-slate-400">Gastos</p><p className="font-semibold text-rose-600">-{totals.expenses}€</p></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <PlusCircle size={20} className="text-indigo-600" />
              Nuevo Registro
            </h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button type="button" onClick={() => setType('expense')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Gasto</button>
                <button type="button" onClick={() => setType('income')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Ingreso</button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Descripción</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. Súper semanal"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  required
                />
                
                {recurringDescs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recurringDescs.slice(0, 5).map(desc => (
                      <div key={desc} className="group flex items-center gap-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-500 transition-all cursor-pointer">
                        <span onClick={() => setDescription(desc)}>{desc}</span>
                        <X size={10} className="hover:text-rose-500" onClick={(e) => { e.stopPropagation(); removeRecurring(desc); }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Importe (€)</label>
                  <input
                    type="number" step="0.01" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-500 font-medium group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                  <Bookmark size={12} />
                  Guardar como opción recurrente
                </span>
              </label>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-yellow-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
              >
                Añadir Registro
              </button>
            </form>
          </div>

          {/* Import Data Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
            <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
              <FileUp size={20} className="text-violet-600" />
              Importar Datos
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Sube un extracto bancario en formato <span className="font-bold">Excel (.xlsx)</span> o <span className="font-bold">Word (.docx)</span>. Nuestra IA extraerá los movimientos automáticamente.
            </p>
            
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.docx,.doc"
              className="hidden" 
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className={`
                w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all
                ${isImporting 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : importSuccess
                    ? 'bg-emerald-50 text-emerald-600 ring-2 ring-emerald-500/20'
                    : 'bg-violet-50 text-violet-700 hover:bg-violet-100 ring-2 ring-violet-500/10'
                }
              `}
            >
              {isImporting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Procesando archivo...</span>
                </>
              ) : importSuccess ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>¡Datos importados!</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={18} />
                  <span>Subir Excel o Word</span>
                </>
              )}
            </button>
            
            {isImporting && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-end justify-center pb-2">
                <span className="text-[10px] font-bold text-violet-600 animate-pulse uppercase tracking-widest">IA analizando documentos...</span>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {aiAnalysis && (
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10"><BrainCircuit size={80} className="text-indigo-600" /></div>
              <div className="relative z-10">
                <h3 className="text-indigo-900 font-bold text-lg mb-3 flex items-center gap-2">
                  <Sparkles size={22} className="text-indigo-600" />
                  IA Insights personalizados
                </h3>
                <p className="text-indigo-800/80 text-sm mb-4 leading-relaxed">{aiAnalysis.summary}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {aiAnalysis.recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-2 text-xs bg-white/50 p-2 rounded-lg border border-indigo-200/50">
                        <span className="text-indigo-600 font-bold">{i+1}.</span><p className="text-indigo-900">{rec}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-indigo-600 text-white p-4 rounded-xl flex flex-col justify-center items-center shadow-inner">
                    <p className="text-xs uppercase font-bold tracking-widest opacity-80 mb-1">Potencial de Ahorro</p>
                    <p className="text-3xl font-black">{aiAnalysis.savingsPotential}</p>
                  </div>
                </div>
                <button onClick={() => setAiAnalysis(null)} className="mt-4 text-xs text-indigo-500 font-medium hover:underline">Ocultar análisis</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-[300px] flex flex-col">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ChartIcon size={20} className="text-indigo-600" />Gastos por Categoría</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-[300px] flex flex-col">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><List size={20} className="text-indigo-600" />Resumen de Actividad</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ name: 'Flujo', Ingresos: totals.income, Gastos: totals.expenses }]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" hide /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend />
                    <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} /><Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Últimos Movimientos</h3>
              <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-full">{transactions.length} registros</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
              {transactions.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><List className="text-slate-300" size={32} /></div>
                  <p className="text-slate-500 font-medium">No hay registros todavía</p>
                </div>
              ) : (
                transactions.map((t) => (
                  <div key={t.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{t.category[0]}</div>
                      <div>
                        <p className="font-semibold text-slate-800">{t.description}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{t.date}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{t.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={`font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>{t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      <button onClick={() => deleteTransaction(t.id)} className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-50"><Trash2 size={18} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
