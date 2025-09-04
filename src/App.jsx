// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";
import { Slider } from "./components/ui/slider";
import UpdaterPanel from "./components/ui/UpdaterPanel.jsx";
import ThemeToggle from "./components/ui/ThemeToggle";
import "./index.css";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from "recharts";
import {
  TrendingDown, TrendingUp, PiggyBank, Wallet2, Trash2, Calendar,
  Search, Settings, Download, Upload
} from "lucide-react";

/* ---------- Utils ---------- */

const CURRENCIES = ["€", "$", "£", "CHF", "¥"];
const DEFAULT_BUDGETS = [
  { name: "Logement",   limit: 600, color: "#A5B4FC" },
  { name: "Courses",    limit: 300, color: "#FBCFE8" },
  { name: "Transport",  limit: 120, color: "#99F6E4" },
  { name: "Santé",      limit: 80,  color: "#FDE68A" },
  { name: "Loisirs",    limit: 150, color: "#C7D2FE" },
  { name: "Restaurants",limit: 120, color: "#FCA5A5" },
  { name: "Autres",     limit: 100, color: "#F5D0FE" },
];
const STORAGE_KEY = "bento-budget-v2";

const iso = (sym) => sym==="€"?"EUR":sym==="$"?"USD":sym==="£"?"GBP":sym==="CHF"?"CHF":sym==="¥"?"JPY":"EUR";
const fmt = (n, cur) => new Intl.NumberFormat(undefined, { style:"currency", currency: iso(cur), maximumFractionDigits:2 }).format(n);
const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw?JSON.parse(raw):initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

function monthLabel(m) { return ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"][m]; }

/* ---------- App (unique default export) ---------- */

export default function App() {
  const [state, setState] = useLocalState(STORAGE_KEY, {
    theme: "dark",
    currency: "€",
    salary: 0,
    monthStartDay: 1,
    goals: [{ id: uid(), name: "Épargne de secours", target: 1000, saved: 0 }],
    budgets: DEFAULT_BUDGETS,
    transactions: [],
  });

  // routing ultra léger via hash
  const [route, setRoute] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // dark mode
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  // ----------- NEW: state maj dispo (toast)
  const [updateInfo, setUpdateInfo] = useState(null);

  /* --------- Tabs & date selections --------- */
  const [tab, setTab] = useState("month"); // "month" | "year"
  const today = new Date();
  const [selYear, setSelYear] = useState(today.getFullYear());
  const [selMonth, setSelMonth] = useState(today.getMonth()); // 0..11

  /* --------- Derived dates --------- */
  const monthStart = useMemo(() => new Date(selYear, selMonth, state.monthStartDay, 0,0,0,0), [selYear, selMonth, state.monthStartDay]);
  const monthEnd   = useMemo(() => new Date(selYear, selMonth+1, state.monthStartDay, 0,0,0,0)-1, [selYear, selMonth, state.monthStartDay]);

  // Transactions du mois courant (sans la ligne synthétique)
  const monthTx = useMemo(() => state.transactions.filter(t => {
    const d = new Date(t.date);
    return d >= monthStart && d <= monthEnd;
  }), [state.transactions, monthStart, monthEnd]);

  /* --------- OVERDRAFT: remboursement du découvert du mois précédent --------- */
  const prevMonthStart = useMemo(
    () => new Date(selYear, selMonth - 1, state.monthStartDay, 0, 0, 0, 0),
    [selYear, selMonth, state.monthStartDay]
  );
  const prevMonthEnd = useMemo(
    () => new Date(selYear, selMonth, state.monthStartDay, 0, 0, 0, 0) - 1,
    [selYear, selMonth, state.monthStartDay]
  );

  const prevMonthTx = useMemo(() => state.transactions.filter(t => {
    const d = new Date(t.date);
    return d >= prevMonthStart && d <= prevMonthEnd;
  }), [state.transactions, prevMonthStart, prevMonthEnd]);

  const prevIncome  = useMemo(()=> prevMonthTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[prevMonthTx]);
  const prevExpense = useMemo(()=> prevMonthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[prevMonthTx]);
  const prevEndBalance = useMemo(()=> (state.salary + prevIncome) - prevExpense, [state.salary, prevIncome, prevExpense]);
  const carryOverDebt  = Math.max(0, -prevEndBalance); // si négatif, à rembourser

  const overdraftTx = useMemo(() => {
    if (!carryOverDebt) return null;
    return {
      id: `overdraft-${selYear}-${selMonth}`,
      date: new Date(monthStart).toISOString().slice(0, 10),
      type: "expense",
      amount: carryOverDebt,
      category: "Banque",
      note: "Remboursement découvert (mois précédent)",
      _synthetic: true,
    };
  }, [carryOverDebt, selYear, selMonth, monthStart]);

  // Transactions du mois + éventuel remboursement
  const monthTxWithDebt = useMemo(
    () => (overdraftTx ? [...monthTx, overdraftTx] : monthTx),
    [monthTx, overdraftTx]
  );

  /* --------- KPIs & agrégations (mois) --------- */
  const income   = useMemo(()=> monthTxWithDebt.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[monthTxWithDebt]);
  const expenses = useMemo(()=> monthTxWithDebt.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[monthTxWithDebt]);
  const balance  = useMemo(()=> (state.salary + income) - expenses, [state.salary, income, expenses]);
  const savingsRate = (state.salary + income) > 0 ? ((balance)/(state.salary + income))*100 : 0;

  // dépenses par catégorie (inclut remboursement)
  const spentByCategory = useMemo(() => {
    const m = new Map();
    for (const t of monthTxWithDebt.filter(x => x.type==="expense")) {
      const k = t.category || "Autres";
      m.set(k, (m.get(k)||0) + t.amount);
    }
    return m;
  }, [monthTxWithDebt]);

  // séries graphiques
  const cashflowSeries = useMemo(() => {
    const start = new Date(monthStart); const end = new Date(monthEnd);
    const arr = []; let running = state.salary; // on démarre au salaire
    while(start <= end){
      const day = start.toISOString().slice(0,10);
      const delta = monthTxWithDebt.filter(t=>t.date===day).reduce((s,t)=> s + (t.type==="income"? t.amount : -t.amount), 0);
      running += delta; arr.push({ d: start.getDate(), solde: running });
      start.setDate(start.getDate()+1);
    }
    return arr;
  }, [monthTxWithDebt, monthStart, monthEnd, state.salary]);

  const categoriesPie = useMemo(() =>
    state.budgets.map(b=>({ name:b.name, value: spentByCategory.get(b.name)||0, color:b.color })), [state.budgets, spentByCategory]
  );

  /* --------- Handlers --------- */
  function addTx(partial) {
    const tx = {
      id: uid(),
      date: partial.date || new Date().toISOString().slice(0,10),
      type: partial.type || "expense",
      amount: Math.max(0, Number(partial.amount||0)),
      category: partial.category || "Autres",
      note: partial.note || "",
    };
    setState(s => ({ ...s, transactions: [tx, ...s.transactions] }));
  }
  const deleteTx = (id) => setState(s => ({ ...s, transactions: s.transactions.filter(t=>t.id!==id) }));

  const updateGoal = (g) => setState(s => ({ ...s, goals: s.goals.map(x => x.id===g.id?g:x) }));
  const addGoal    = () => setState(s => ({ ...s, goals: [...s.goals, { id: uid(), name:"Nouvel objectif", target:500, saved:0 }] }));
  const deleteGoal = (id) => setState(s => ({ ...s, goals: s.goals.filter(g=>g.id!==id) }));

  const setBudget = (name, limit) =>
    setState(s => ({ ...s, budgets: s.budgets.map(b => b.name===name ? { ...b, limit } : b) }));
  const upsertBudget = (name) => {
    const n = name.trim(); if(!n) return;
    setState(s => s.budgets.some(b=>b.name.toLowerCase()===n.toLowerCase()) ? s
      : ({ ...s, budgets: [...s.budgets, { name:n, limit:0 }] }));
  };

  const exportData = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)], {type:"application/json"}));
    a.download = "bento-budget.json"; a.click();
  };
  const importData = (file) => {
    const r = new FileReader();
    r.onload = () => { try { setState(JSON.parse(String(r.result))); } catch { alert("Fichier invalide"); } };
    r.readAsText(file);
  };

  /* --------- Yearly aggregations --------- */
  const yearsAvailable = useMemo(() => {
    const years = new Set(state.transactions.map(t => new Date(t.date).getFullYear()));
    years.add(selYear);
    return Array.from(years).sort((a,b)=>a-b);
  }, [state.transactions, selYear]);

  const yearSeries = useMemo(() => {
    const base = Array.from({length:12}, (_,m)=>({ name: monthLabel(m), revenus:0, depenses:0 }));
    for(const t of state.transactions){
      const d = new Date(t.date);
      if(d.getFullYear() !== selYear) continue;
      if(t.type==="income") base[d.getMonth()].revenus += t.amount;
      else base[d.getMonth()].depenses += t.amount;
    }
    base.forEach(x => x.revenus += state.salary); // salaire mensuel récurrent
    return base;
  }, [state.transactions, selYear, state.salary]);

  /* --------- Routing: page Mises à jour --------- */
  if (route === "#/updates") {
    return (
      <UpdaterPanel
        variant="page"
        onBack={() => (window.location.hash = "#/")}
        onUpdateAvailable={(info) => setUpdateInfo(info)} // callback vers le toast
      />
    );
  }

  /* --------- UI principale --------- */
  return (
    <div
      className="min-h-screen w-full overflow-x-hidden text-slate-100 p-4 md:p-8 bg-slate-950"
      style={{
        backgroundImage:
          "radial-gradient(1200px 600px at 50% -200px, rgba(99,102,241,.08), transparent 60%)",
      }}
    >
      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-400/80 to-fuchsia-400/80 backdrop-blur shadow-lg" />
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Bento Budget</h1>
              <p className="text-sm text-slate-400">Mensuel et Annuel, bien séparés 🍱</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle value={state.theme==="dark"} onChange={(d)=>setState(s=>({...s, theme:d?"dark":"light"}))}/>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-800/60 px-2 py-2">
              {CURRENCIES.map(c=> (
                <Button key={c} variant={state.currency===c?"default":"ghost"} className="rounded-xl" onClick={()=>setState(s=>({...s, currency:c}))}>
                  {c}
                </Button>
              ))}
            </div>
            {/* Lien vers la page Mises à jour */}
            <a href="#/updates" className="rounded-xl px-3 py-2 bg-slate-800/60 hover:bg-slate-700/60 transition text-sm">
              Mises à jour
            </a>
          </div>
        </header>

        {/* -------- NOTIF Apple-like -------- */}
        <AnimatePresence>
          {updateInfo && (
            <motion.div
              initial={{ opacity: 0, x: -40, y: 20 }}
              animate={{ opacity: 1, x: 0, y: 20 }}
              exit={{ opacity: 0, x: -40, y: 20 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="fixed top-6 left-6 z-50 flex items-center gap-3 rounded-2xl bg-slate-900/80 backdrop-blur-md text-slate-100 px-5 py-3 shadow-xl border border-white/10"
              style={{ minWidth: "260px" }}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-lg">
                🚀
              </div>
              <div className="flex-1">
                <div className="font-semibold">Mise à jour dispo</div>
                <div className="text-sm opacity-80">Version {updateInfo.version}</div>
              </div>
              <Button
                size="sm"
                className="rounded-lg"
                onClick={() => (window.location.hash = "#/updates")}
              >
                Voir
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          <Button variant={tab==="month"?"default":"secondary"} className="rounded-xl" onClick={()=>setTab("month")}>Vue mensuelle</Button>
          <Button variant={tab==="year"?"default":"secondary"} className="rounded-xl" onClick={()=>setTab("year")}>Vue annuelle</Button>
        </div>

        {tab==="month" ? (
          <MonthView
            state={state}
            setState={setState}
            selYear={selYear}
            setSelYear={setSelYear}
            selMonth={selMonth}
            setSelMonth={setSelMonth}
            monthStart={monthStart}
            monthEnd={monthEnd}
            income={income}
            expenses={expenses}
            balance={balance}
            savingsRate={savingsRate}
            cashflowSeries={cashflowSeries}
            categoriesPie={categoriesPie}
            spentByCategory={spentByCategory}
            addTx={addTx}
            deleteTx={deleteTx}
            setBudget={setBudget}
            upsertBudget={upsertBudget}
            updateGoal={updateGoal}
            addGoal={addGoal}
            deleteGoal={deleteGoal}
            exportData={exportData}
            importData={importData}
            overdraftTx={overdraftTx}
          />
        ) : (
          <YearView
            state={state}
            setState={setState}
            yearsAvailable={yearsAvailable}
            selYear={selYear}
            setSelYear={setSelYear}
            yearSeries={yearSeries}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Month View ---------- */

function MonthView(props){
  const {
    state, setState, selYear, setSelYear, selMonth, setSelMonth,
    monthStart, monthEnd, income, expenses, balance, savingsRate,
    cashflowSeries, categoriesPie, spentByCategory,
    addTx, deleteTx, setBudget, upsertBudget,
    updateGoal, addGoal, deleteGoal, exportData, importData,
    overdraftTx
  } = props;

  const [search, setSearch] = useState("");

  const monthTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? state.transactions.filter(t => {
          const d = new Date(t.date);
          const inRange = d >= monthStart && d <= monthEnd;
          return inRange && (`${t.note} ${t.category}`).toLowerCase().includes(q);
        })
      : state.transactions.filter(t => {
          const d = new Date(t.date);
          return d >= monthStart && d <= monthEnd;
        });
  }, [state.transactions, monthStart, monthEnd, search]);

  // Injecter la ligne synthétique si elle existe et passe le filtre
  const monthTxAugmented = useMemo(() => {
    const base = monthTx.slice();
    if (!overdraftTx) return base;
    const matchesSearch = (txt) => txt.toLowerCase().includes(search.trim().toLowerCase());
    const d = new Date(overdraftTx.date);
    const inRange = d >= monthStart && d <= monthEnd;
    if (inRange) {
      if (!search || matchesSearch(`${overdraftTx.note} ${overdraftTx.category}`)) {
        return [overdraftTx, ...base];
      }
    }
    return base;
  }, [monthTx, overdraftTx, search, monthStart, monthEnd]);

  return (
    <div className="grid gap-3 sm:gap-4 lg:gap-6 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] lg:grid-cols-3">
      {/* Summary */}
      <BentoCard className="lg:col-span-2 min-w-0" gradient="from-indigo-400/20 via-fuchsia-400/10 to-cyan-400/20">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Wallet2 className="h-5 w-5" /> Vue du mois</CardTitle>
            <CardDescription className="truncate">
              Période : {new Date(monthStart).toLocaleDateString()} → {new Date(monthEnd).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="w-full md:w-auto flex flex-wrap items-center gap-2">
            <select className="w-full sm:w-auto rounded-xl bg-slate-800/60 px-3 py-2 outline-none" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>
              {Array.from({length:12},(_,m)=><option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <Input type="number" className="w-full sm:w-28 rounded-xl" value={selYear} onChange={e=>setSelYear(Number(e.target.value||0))}/>
            <Button variant="outline" className="rounded-xl w-full sm:w-auto" onClick={exportData}><Download className="h-4 w-4 mr-2"/>Exporter</Button>
            <label className="w-full sm:w-auto inline-flex items-center">
              <input type="file" className="hidden" onChange={(e)=>e.target.files && importData(e.target.files[0])}/>
              <span className="inline-flex items-center gap-2 rounded-xl bg-slate-800/60 px-3 py-2 cursor-pointer hover:bg-slate-700/60 transition w-full sm:w-auto justify-center">
                <Upload className="h-4 w-4" /> Importer
              </span>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Salaire"  value={fmt(state.salary, state.currency)} icon={<TrendingUp className="h-4 w-4" />} />
            <KPI label="Revenus"  value={fmt(income,       state.currency)} icon={<TrendingUp className="h-4 w-4" />} />
            <KPI label="Dépenses" value={fmt(expenses,     state.currency)} icon={<TrendingDown className="h-4 w-4" />} />
            <KPI label="Solde"    value={fmt(balance,      state.currency)} icon={<PiggyBank className="h-4 w-4" />} />
          </div>

          <div className="mt-2 text-sm text-slate-300">Taux d’épargne : {savingsRate.toFixed(0)}%</div>
          {overdraftTx && overdraftTx.amount>0 && (
            <div className="mt-1 text-xs text-slate-400">
              Inclut remboursement découvert : <strong>{fmt(overdraftTx.amount, state.currency)}</strong>
            </div>
          )}

          <div className="mt-4 h-[180px] sm:h-[220px] lg:h-[260px] rounded-2xl bg-slate-800/40 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowSeries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="d" />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                <Area type="monotone" dataKey="solde" stroke="#a78bfa" fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </BentoCard>

      {/* Salaire + Ajout rapide */}
      <BentoCard gradient="from-emerald-400/20 via-teal-400/10 to-cyan-400/20">
        <CardHeader>
          <CardTitle>Entrées rapides</CardTitle>
          <CardDescription>Salaire + transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl bg-slate-800/40 p-2">
            <Label className="text-xs">Salaire mensuel</Label>
            <Input type="number" className="rounded-xl mt-2" value={state.salary} onChange={(e)=>setState(s=>({...s, salary: Number(e.target.value||0)}))}/>
          </div>
          <QuickAdd onAdd={addTx} currency={state.currency} budgets={state.budgets}/>
        </CardContent>
      </BentoCard>

      {/* Budgets */}
      <BentoCard className="lg:col-span-2" gradient="from-fuchsia-400/10 via-indigo-400/10 to-sky-400/10">
        <CardHeader>
          <CardTitle>Budgets par catégorie</CardTitle>
          <CardDescription>Ajuste tes enveloppes pour ce mois</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Nouvelle catégorie" id="newcat" className="rounded-xl" />
            <Button className="rounded-xl" onClick={()=>{
              const el=document.getElementById("newcat"); if(el){ upsertBudget(el.value); el.value=""; }
            }}>Ajouter</Button>
          </div>
          {state.budgets.map(b=>{
            const spent = spentByCategory.get(b.name)||0;
            const ratio = b.limit>0 ? Math.min(1, spent/b.limit) : 0;
            return (
              <div key={b.name} className="rounded-2xl bg-slate-800/40 p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-slate-400">{fmt(spent, state.currency)} / {fmt(b.limit, state.currency)}</div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-700/60 overflow-hidden">
                  <div className="h-full" style={{ width:`${ratio*100}%`, background:b.color||"#A5B4FC" }}/>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Label className="text-xs text-slate-400">Plafond mensuel</Label>
                  <Slider defaultValue={[b.limit]} max={2000} step={10} onValueChange={(v)=>setBudget(b.name, v[0])}/>
                </div>
              </div>
            );
          })}
        </CardContent>
      </BentoCard>

      {/* Dépenses par catégorie */}
      <BentoCard gradient="from-rose-400/10 via-amber-400/10 to-violet-400/10">
        <CardHeader><CardTitle>Dépenses par catégorie</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px] sm:h-[240px] lg:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoriesPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60}>
                  {categoriesPie.map((e,i)=> <Cell key={i} fill={e.color || "#a78bfa"}/>)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </BentoCard>

      {/* Transactions */}
      <BentoCard className="lg:col-span-2" gradient="from-indigo-400/10 via-slate-400/10 to-teal-400/10">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>Ajoute, filtre et supprime</CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Input placeholder="Rechercher..." className="rounded-xl h-9 flex-1" value={search} onChange={e=>setSearch(e.target.value)}/>
            <Button variant="secondary" className="rounded-xl h-9"><Search className="h-4 w-4 mr-1"/>Filtrer</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-auto pr-2">
            {monthTxAugmented.length===0 && <div className="text-slate-400 text-sm">Aucune transaction sur cette période.</div>}
            {monthTxAugmented.map(t=> (
              <div key={t.id} className="rounded-xl bg-slate-800/40 px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${t.type==="income"?"bg-emerald-400/20":"bg-rose-400/20"}`}>
                    {t.type==="income"?<TrendingUp className="h-4 w-4"/>:<TrendingDown className="h-4 w-4"/>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.category}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 truncate">
                      <Calendar className="h-3 w-3"/> {new Date(t.date).toLocaleDateString()} • {t.note||"—"}
                    </div>
                  </div>
                </div>
                <div className={`font-semibold ${t.type==="income"?"text-emerald-300":"text-rose-300"}`}>
                  {t.type==="income" ? "+" : "-"}{fmt(t.amount, state.currency)}
                </div>
                {!t._synthetic && (
                  <Button variant="ghost" className="rounded-xl" onClick={()=>deleteTx(t.id)}><Trash2 className="h-4 w-4"/></Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </BentoCard>

      {/* Objectifs */}
      <BentoCard gradient="from-teal-400/10 via-emerald-400/10 to-indigo-400/10">
        <CardHeader>
          <CardTitle>Objectifs</CardTitle>
          <CardDescription>Épargne dédiée, suivi visuel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.goals.map(g=>{
            const ratio = Math.min(1, g.saved/(g.target||1));
            return (
              <div key={g.id} className="rounded-2xl bg-slate-800/40 p-3">
                <div className="flex items-center gap-2">
                  <Input defaultValue={g.name} className="rounded-xl h-8 w-44 bg-slate-900/60" onBlur={(e)=>updateGoal({ ...g, name:e.target.value })}/>
                  <span className="text-xs text-slate-400">Objectif</span>
                  <Input type="number" defaultValue={g.target} className="rounded-xl h-8 w-24 bg-slate-900/60" onBlur={(e)=>updateGoal({ ...g, target:Number(e.target.value||0) })}/>
                  <span className="ml-auto font-medium">{fmt(g.saved, state.currency)} / {fmt(g.target, state.currency)}</span>
                  <Button variant="destructive" className="rounded-xl" onClick={()=>deleteGoal(g.id)}><Trash2 className="h-4 w-4"/></Button>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-700/60 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width:`${ratio*100}%` }}/>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-slate-400 text-sm">Épargné</Label>
                  <Input type="number" defaultValue={g.saved} className="rounded-xl h-8 w-28 bg-slate-900/60" onBlur={(e)=>updateGoal({ ...g, saved:Number(e.target.value||0) })}/>
                </div>
              </div>
            );
          })}
          <Button className="rounded-xl w-full" onClick={addGoal}>Ajouter un objectif</Button>
        </CardContent>
      </BentoCard>

      {/* Réglages */}
      <BentoCard gradient="from-sky-400/10 via-indigo-400/10 to-fuchsia-400/10">
        <CardHeader>
          <CardTitle><Settings className="h-5 w-5 inline mr-2"/> Réglages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-slate-800/40 p-3">
            <Label className="text-sm">Début de mois personnalisé</Label>
            <div className="flex items-center gap-3 mt-2">
              <Slider defaultValue={[state.monthStartDay]} min={1} max={28} step={1}
                onValueChange={(v)=>setState(s=>({...s, monthStartDay:v[0]}))}/>
              <div className="w-10 text-center font-medium">{state.monthStartDay}</div>
            </div>
            <p className="text-xs text-slate-400 mt-1">Utile si ton salaire tombe le {state.monthStartDay} du mois.</p>
          </div>
        </CardContent>
      </BentoCard>
    </div>
  );
}

/* ---------- Year View ---------- */

function YearView({ state, setState, yearsAvailable, selYear, setSelYear, yearSeries }) {
  const totalYearIncome  = yearSeries.reduce((s,m)=>s+m.revenus, 0);
  const totalYearExpense = yearSeries.reduce((s,m)=>s+m.depenses, 0);
  const totalYearBalance = totalYearIncome - totalYearExpense;

  return (
    <div className="grid gap-3 sm:gap-4 lg:gap-6 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] lg:grid-cols-3">
      <BentoCard className="lg:col-span-2 min-w-0" gradient="from-indigo-400/20 via-fuchsia-400/10 to-cyan-400/20">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Vue annuelle</CardTitle>
            <CardDescription>Résumé de l’année {selYear}</CardDescription>
          </div>
          <select className="w-full sm:w-auto rounded-xl bg-slate-800/60 px-3 py-2 outline-none" value={selYear} onChange={(e)=>setSelYear(Number(e.target.value))}>
            {yearsAvailable.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <KPI label="Revenus annuels"  value={fmt(totalYearIncome,  state.currency)} icon={<TrendingUp className="h-4 w-4" />} />
            <KPI label="Dépenses annuelles" value={fmt(totalYearExpense, state.currency)} icon={<TrendingDown className="h-4 w-4" />} />
            <KPI label="Solde annuel"      value={fmt(totalYearBalance, state.currency)} icon={<PiggyBank className="h-4 w-4" />} />
          </div>
          <div className="mt-4 h-[220px] sm:h-[280px] lg:h-[340px] rounded-2xl bg-slate-800/40 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearSeries}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15}/>
                <XAxis dataKey="name"/>
                <YAxis />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }}/>
                <Legend />
                <Bar dataKey="revenus" />
                <Bar dataKey="depenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </BentoCard>

      <BentoCard gradient="from-teal-400/10 via-emerald-400/10 to-indigo-400/10">
        <CardHeader>
          <CardTitle>Paramètres rapides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl bg-slate-800/40 p-2">
            <Label className="text-xs">Salaire mensuel</Label>
            <Input type="number" className="rounded-xl mt-2" value={state.salary} onChange={(e)=>setState(s=>({...s, salary:Number(e.target.value||0)}))}/>
          </div>
          <div className="rounded-xl bg-slate-800/40 p-2">
            <Label className="text-xs">Devise</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CURRENCIES.map(c=> (
                <Button key={c} variant={state.currency===c?"default":"secondary"} className="rounded-xl" onClick={()=>setState(s=>({...s, currency:c}))}>{c}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </BentoCard>
    </div>
  );
}

/* ---------- Shared subcomponents ---------- */

function BentoCard({ children, className="", gradient="from-indigo-400/10 via-fuchsia-400/10 to-cyan-400/10" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`min-w-0 rounded-3xl bg-slate-900/60 backdrop-blur shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/10 ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))` }}
    >
      <div className={`rounded-3xl bg-gradient-to-br ${gradient}`}>
        <Card className="bg-transparent border-0 shadow-none">{children}</Card>
      </div>
    </motion.div>
  );
}

function KPI({ label, value, icon }) {
  return (
    <div className="rounded-2xl bg-slate-800/50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold flex items-center gap-2">{icon} {value}</div>
    </div>
  );
}

function QuickAdd({ onAdd, currency, budgets }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(budgets[0]?.name || "Autres");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      {/* isolate = évite que les ombres glissent sur les voisins */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch isolate">
        {/* TYPE */}
        <div className="rounded-xl bg-slate-800/40 p-2 min-w-0">
          <Label className="text-xs">Type</Label>
          <div className="mt-2 flex gap-2">
            <Button
              className="rounded-xl flex-1 shadow-none"
              variant={type === "expense" ? "default" : "secondary"}
              onClick={() => setType("expense")}
            >
              <TrendingDown className="h-4 w-4 mr-1" />
              Dépense
            </Button>
            <Button
              className="rounded-xl flex-1 shadow-none"
              variant={type === "income" ? "default" : "secondary"}
              onClick={() => setType("income")}
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Revenu
            </Button>
          </div>
        </div>

        {/* MONTANT */}
        <div className="rounded-xl bg-slate-800/40 p-2 min-w-0">
          <Label className="text-xs">Montant ({currency})</Label>
          <Input
            type="number"
            className="rounded-xl mt-2"
            value={amount === 0 ? "" : amount}
            onFocus={(e) => {
              if (amount === 0) setAmount(""); // efface le 0 quand on clique
            }}
            onBlur={(e) => {
              if (e.target.value === "" || isNaN(Number(e.target.value))) {
                setAmount(0); // remet 0 si on sort du champ sans rien mettre
              }
            }}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="0"
          />
        </div>

        {/* DATE */}
        <div className="relative rounded-xl bg-slate-800/40 p-2 overflow-hidden">
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            className="rounded-xl mt-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* CATÉGORIE */}
        <div className="relative rounded-xl bg-slate-800/40 p-2 overflow-hidden">
          <Label className="text-xs">Catégorie</Label>
          <select
            className="mt-2 w-full rounded-xl bg-slate-900/60 p-2 outline-none"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {budgets.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* NOTE */}
      <div className="rounded-xl bg-slate-800/40 p-2">
        <Label className="text-xs">Note</Label>
        <Textarea
          className="rounded-xl mt-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex: courses, essence, resto..."
        />
      </div>

      <Button
        className="rounded-xl w-full"
        onClick={() => {
          onAdd({ type, amount, date, category, note });
          setAmount(0);
          setNote("");
        }}
      >
        Ajouter
      </Button>
    </div>
  );
}