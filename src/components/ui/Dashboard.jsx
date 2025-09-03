import React, { useMemo, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { Button } from "./button";
import { Input } from "./input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "./card";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const [darkMode, setDarkMode] = useState(false);

  // salaire / dépenses
  const [salary, setSalary] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  // objectifs
  const [goals, setGoals] = useState([]);
  const [goalInput, setGoalInput] = useState("");

  // filtre d’affichage (simple démo)
  const [filter, setFilter] = useState("all");

  const totalExpenses = useMemo(
    () => expenses.reduce((acc, e) => acc + e.amount, 0),
    [expenses]
  );
  const remaining = salary ? Number(salary || 0) - totalExpenses : 0;

  function addExpense() {
    if (!expenseName.trim() || !expenseAmount) return;
    const amt = Number(expenseAmount);
    if (Number.isNaN(amt)) return;
    setExpenses((x) => [...x, { name: expenseName.trim(), amount: amt }]);
    setExpenseName("");
    setExpenseAmount("");
  }

  function addGoal() {
    if (!goalInput.trim()) return;
    setGoals((g) => [...g, goalInput.trim()]);
    setGoalInput("");
  }

  function removeGoal(i) {
    setGoals((g) => g.filter((_, idx) => idx !== i));
  }

  const listVariants = {
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
    hidden: {},
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.2 } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <ThemeToggle value={darkMode} onChange={setDarkMode} />
      </div>

      {/* grille principale : on utilise des gaps (pas de divide-*) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bloc "Vue rapide" salaire */}
        <Card>
          <CardHeader>
            <CardTitle>Mon salaire</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input
                type="number"
                placeholder="Entrez votre salaire"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
              <p className="text-sm text-slate-300">
                Dépenses totales : <strong>{totalExpenses.toFixed(2)} €</strong>
              </p>
              <p className="text-sm text-slate-300">
                Reste :{" "}
                <strong className={remaining < 0 ? "text-rose-300" : "text-emerald-300"}>
                  {remaining.toFixed(2)} €
                </strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bloc "Entrées rapides" dépenses */}
        <Card>
          <CardHeader>
            <CardTitle>Entrées rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3 mb-3">
              <Input
                placeholder="Nom de la dépense"
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Montant (€)"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>

            {/* Bouton “Ajouter” -> variant glow + halo, large et visible */}
            <Button variant="glow" className="w-full text-base py-2.5" onClick={addExpense}>
              Ajouter
            </Button>
          </CardContent>

          {/* Liste des dépenses */}
          <CardFooter className="pt-4">
            <AnimatePresence initial={false}>
              {expenses.length > 0 ? (
                <motion.ul
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className="w-full space-y-2"
                >
                  {expenses.map((e, i) => (
                    <motion.li
                      key={i}
                      variants={itemVariants}
                      exit="exit"
                      className="flex items-center justify-between rounded-2xl px-3 py-2 bg-slate-900/50 ring-1 ring-white/10"
                    >
                      <span className="truncate pr-3">{e.name}</span>
                      <span className="font-medium text-rose-300">{e.amount.toFixed(2)} €</span>
                    </motion.li>
                  ))}
                </motion.ul>
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.8 }}
                  className="text-sm text-slate-400"
                >
                  Aucune dépense pour l’instant.
                </motion.p>
              )}
            </AnimatePresence>
          </CardFooter>
        </Card>

        {/* Bloc objectifs */}
        <Card>
          <CardHeader>
            <CardTitle>Mes objectifs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-3">
              <Input
                placeholder="Nouvel objectif"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
              />
              <Button variant="glow" onClick={addGoal} className="px-5">
                Ajouter
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {goals.length > 0 ? (
                <motion.ul
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-2"
                >
                  {goals.map((goal, i) => (
                    <motion.li
                      key={goal + i}
                      variants={itemVariants}
                      exit="exit"
                      className="flex items-center justify-between rounded-2xl px-3 py-2 bg-slate-900/50 ring-1 ring-white/10"
                    >
                      <span className="truncate pr-3">{goal}</span>
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5 text-sm"
                        onClick={() => removeGoal(i)}
                      >
                        Supprimer
                      </Button>
                    </motion.li>
                  ))}
                </motion.ul>
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.8 }}
                  className="text-sm text-slate-400"
                >
                  Ajoute un premier objectif pour t’y tenir ✨
                </motion.p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Bloc filtre de démo */}
        <Card className="lg:col-span-2">
          <CardContent className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              Filtre actuel :{" "}
              <span className="text-slate-200 font-medium">{filter === "all" ? "Tout" : "Dépenses uniquement"}</span>
            </div>
            <Button
              variant="secondary"
              onClick={() => setFilter((f) => (f === "all" ? "expenses" : "all"))}
            >
              {filter === "all" ? "Voir uniquement les dépenses" : "Voir tout"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}