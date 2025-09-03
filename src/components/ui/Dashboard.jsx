import React, { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { Button } from "./button";
import { Input } from "./input";
import { Card, CardHeader, CardTitle, CardContent } from "./card";

export default function Dashboard() {
  const [darkMode, setDarkMode] = useState(false);
  const [salary, setSalary] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [goals, setGoals] = useState([]);
  const [goalInput, setGoalInput] = useState("");
  const [filter, setFilter] = useState("all");

  const addGoal = () => {
    if (goalInput.trim()) {
      setGoals([...goals, goalInput]);
      setGoalInput("");
    }
  };

  const removeGoal = (index) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const addExpense = () => {
    if (expenseName && expenseAmount) {
      setExpenses([...expenses, { name: expenseName, amount: parseFloat(expenseAmount) }]);
      setExpenseName("");
      setExpenseAmount("");
    }
  };

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const remaining = salary ? parseFloat(salary) - totalExpenses : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <ThemeToggle value={darkMode} onChange={setDarkMode} />
      </div>

      {/* Section salaire */}
      <Card className="mb-4 bg-slate-800/50 shadow-lg">
        <CardHeader>
          <CardTitle>Mon salaire</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            placeholder="Entrez votre salaire"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
          <p className="mt-2 text-sm text-slate-300">
            Dépenses totales : <strong>{totalExpenses} €</strong>
          </p>
          <p className="text-sm text-slate-300">
            Reste : <strong>{remaining} €</strong>
          </p>
        </CardContent>
      </Card>

      {/* Section dépenses */}
      <Card className="mb-4 bg-slate-800/50 shadow-lg">
        <CardHeader>
          <CardTitle>Mes dépenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Nom de la dépense"
              value={expenseName}
              onChange={(e) => setExpenseName(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Montant"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
            />
            <Button onClick={addExpense}>Ajouter</Button>
          </div>
          <ul>
            {expenses.map((e, i) => (
              <li key={i} className="flex justify-between py-1">
                <span>{e.name}</span>
                <span className="text-red-400">{e.amount} €</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Section objectifs */}
      <Card className="mb-4 bg-slate-800/50 shadow-lg">
        <CardHeader>
          <CardTitle>Mes objectifs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Nouvel objectif"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
            />
            <Button onClick={addGoal}>Ajouter</Button>
          </div>
          <ul>
            {goals.map((goal, i) => (
              <li key={i} className="flex justify-between py-1">
                <span>{goal}</span>
                <Button variant="destructive" onClick={() => removeGoal(i)}>Supprimer</Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Bouton filtrer */}
      <div className="flex justify-center mt-4">
        <Button variant="outline" onClick={() => setFilter(filter === "all" ? "expenses" : "all")}>
          {filter === "all" ? "Voir uniquement les dépenses" : "Voir tout"}
        </Button>
      </div>
    </div>
  );
}
