// controllers/dashboardController.js
const Income = require("../models/Income");
const Expense = require("../models/Expense");
const { Types } = require("mongoose");

exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const userObjectId = new Types.ObjectId(String(userId));

    // Total income
    const incomeAgg = await Income.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalIncome = (incomeAgg[0] && incomeAgg[0].total) || 0;

    // Total expense
    const expenseAgg = await Expense.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalExpense = (expenseAgg[0] && expenseAgg[0].total) || 0;

    // Balance
    const balance = totalIncome - totalExpense;

    // Expenses by category
    const expensesByCategory = await Expense.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]).then((arr) =>
      arr.map((a) => ({ category: a._id, total: a.total, count: a.count }))
    );

    // Income by source
    const incomeBySource = await Income.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: "$source",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]).then((arr) =>
      arr.map((a) => ({ source: a._id, total: a.total, count: a.count }))
    );

    // Helper: format transactions
    const formatTx = (doc, type) => ({
      id: doc._id,
      type,
      amount: doc.amount,
      date: doc.date,
      icon: doc.icon || null,
      category: type === "expense" ? doc.category : undefined,
      source: type === "income" ? doc.source : undefined,
    });

    // Recent transactions: fetch last 10 expenses + last 10 incomes, merge & sort
    const recentExpenses = await Expense.find({ userId: userObjectId })
      .sort({ date: -1 })
      .limit(10)
      .lean();
    const recentIncomes = await Income.find({ userId: userObjectId })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    const recentTransactions = [
      ...recentExpenses.map((d) => formatTx(d, "expense")),
      ...recentIncomes.map((d) => formatTx(d, "income")),
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    // Last 30 days expenses
    const date30 = new Date();
    date30.setDate(date30.getDate() - 30);
    const last30ExpensesDocs = await Expense.find({
      userId: userObjectId,
      date: { $gte: date30 },
    })
      .sort({ date: -1 })
      .lean();
    const last30DaysExpenses = last30ExpensesDocs.reduce((s, d) => s + (d.amount || 0), 0);

    // Last 60 days income
    const date60 = new Date();
    date60.setDate(date60.getDate() - 60);
    const last60IncomeDocs = await Income.find({
      userId: userObjectId,
      date: { $gte: date60 },
    })
      .sort({ date: -1 })
      .lean();
    const last60DaysIncome = last60IncomeDocs.reduce((s, d) => s + (d.amount || 0), 0);

    return res.status(200).json({
      totalIncome,
      totalExpense,
      balance,
      expensesByCategory,
      incomeBySource,
      last30DaysExpenses: {
        total: last30DaysExpenses,
        transactions: last30ExpensesDocs.map((d) => formatTx(d, "expense")),
      },
      last60DaysIncome: {
        total: last60DaysIncome,
        transactions: last60IncomeDocs.map((d) => formatTx(d, "income")),
      },
      recentTransactions,
    });
  } catch (error) {
    console.error("getDashboardData error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message || error });
  }
};
