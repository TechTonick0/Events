import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Calculator, Trash2, FileSpreadsheet, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from "jspdf";
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { v4 as uuidv4 } from 'uuid';

const AccountingPage = () => {
    const { eventId } = useParams();
    const [events, setEvents] = useLocalStorage('cardshow_events', []);

    const [chartDims, setChartDims] = useState({ width: 0, height: 0 });
    const chartContainerRef = React.useRef(null);

    useEffect(() => {
        const updateDims = () => {
            if (chartContainerRef.current) {
                setChartDims({
                    width: chartContainerRef.current.offsetWidth,
                    height: chartContainerRef.current.offsetHeight
                });
            }
        };

        // Initial measure
        updateDims();

        const resizeObserver = new ResizeObserver(() => {
            updateDims();
        });

        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Derived State
    const eventIndex = events.findIndex(e => e.id === eventId);
    const event = events[eventIndex];
    const entries = event?.ledger || [];

    // Helpers
    const updateEventLedger = (newLedger) => {
        const updatedEvents = [...events];
        updatedEvents[eventIndex] = { ...event, ledger: newLedger };
        setEvents(updatedEvents);
    };

    // Form State
    const [newItem, setNewItem] = useState({
        category: '',
        amount: '',
        type: 'expense',
        phase: 'projected'
    });
    const [showCalc, setShowCalc] = useState(false);
    const [calcData, setCalcData] = useState({ count: '', rate: '', hours: '' });

    const addEntry = (phase) => {
        if (!newItem.category || !newItem.amount) return;
        const entry = {
            id: uuidv4(),
            category: newItem.category,
            payee: newItem.payee,
            amount: parseFloat(newItem.amount),
            type: newItem.type,
            phase: phase
        };
        updateEventLedger([...entries, entry]);
        setNewItem({ ...newItem, amount: '', category: '', payee: '' });
    };

    const addVariableExpense = () => {
        const total = (parseFloat(calcData.count) || 0) * (parseFloat(calcData.rate) || 0) * (parseFloat(calcData.hours) || 1);
        if (total > 0) {
            setNewItem({ ...newItem, amount: total.toString() });
            setShowCalc(false);
        }
    };

    const deleteEntry = (id) => {
        if (window.confirm('Delete this transaction?')) {
            updateEventLedger(entries.filter(e => e.id !== id));
        }
    };

    const stats = useMemo(() => {
        const calc = (phase) => {
            const income = entries
                .filter(e => e.phase === phase && e.type === 'income')
                .reduce((sum, e) => sum + e.amount, 0);
            const expenses = entries
                .filter(e => e.phase === phase && e.type === 'expense')
                .reduce((sum, e) => sum + e.amount, 0);
            return { income, expenses, profit: income - expenses };
        };
        return {
            projected: calc('projected'),
            actual: calc('actual')
        };
    }, [entries]);

    const handleExportCSV = () => {
        const headers = ["Type,Category,Payee,Phase,Amount"];
        const rows = entries.map(e =>
            `${e.type},"${e.category}","${e.payee || ''}",${e.phase},${e.amount}`
        );
        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.concat(rows).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${event.name || 'Event'}_financials.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.text("Financial Report", 14, 20);
        doc.setFontSize(14);
        doc.text(event.name || "Event Name", 14, 30);

        doc.setFontSize(12);
        doc.text("Summary", 14, 45);

        // Projected
        doc.setFontSize(10);
        doc.text(`Projected Income: $${stats.projected.income.toFixed(2)}`, 14, 55);
        doc.text(`Projected Expenses: $${stats.projected.expenses.toFixed(2)}`, 14, 60);
        doc.text(`Projected Net: $${stats.projected.profit.toFixed(2)}`, 14, 65);

        // Actual
        doc.text(`Actual Income: $${stats.actual.income.toFixed(2)}`, 110, 55);
        doc.text(`Actual Expenses: $${stats.actual.expenses.toFixed(2)}`, 110, 60);
        doc.text(`Actual Net: $${stats.actual.profit.toFixed(2)}`, 110, 65);

        // Details
        doc.setFontSize(12);
        doc.text("Transaction Details", 14, 80);

        let y = 90;
        doc.setFontSize(10);

        // Headers
        doc.setFont(undefined, 'bold');
        doc.text("Date", 14, y); // Placeholder if we had distinct dates
        doc.text("Type", 40, y);
        doc.text("Category / Payee", 70, y);
        doc.text("Amount", 170, y);
        doc.setFont(undefined, 'normal');

        y += 10;

        entries.forEach((e) => {
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            const label = e.payee ? `${e.category} (${e.payee})` : e.category;
            doc.text(e.phase.substring(0, 1).toUpperCase() + e.phase.substring(1), 14, y);
            doc.text(e.type, 40, y);
            doc.text(label, 70, y);
            doc.text(`$${e.amount.toFixed(2)}`, 170, y);
            y += 7;
        });

        doc.save(`${event.name || 'Event'}_financials.pdf`);
    };

    const chartData = [
        { name: 'Income', Projected: stats.projected.income, Actual: stats.actual.income },
        { name: 'Expenses', Projected: stats.projected.expenses, Actual: stats.actual.expenses },
        { name: 'Profit', Projected: stats.projected.profit, Actual: stats.actual.profit },
    ];

    if (!event) return <div className="page-container" style={{ marginTop: '50px' }}>Loading...</div>;

    return (
        <div className="page-container" style={{ paddingBottom: '100px', marginTop: '50px' }}>
            <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '28px' }}>Financials</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{event.name}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button onClick={handleExportCSV} variant="outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileSpreadsheet size={16} /> Export CSV
                    </Button>
                    <Button onClick={handleExportPDF} variant="outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} /> Export PDF
                    </Button>
                </div>
            </header>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <Card title="Projected Profit">
                    <div style={{ fontSize: '32px', fontWeight: 700, color: stats.projected.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        ${stats.projected.profit.toLocaleString()}
                    </div>
                </Card>
                <Card title="Actual Profit">
                    <div style={{ fontSize: '32px', fontWeight: 700, color: stats.actual.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        ${stats.actual.profit.toLocaleString()}
                    </div>
                </Card>
            </div>

            {/* Chart */}
            {/* Chart */}
            {/* Chart */}
            <Card style={{ height: '300px', marginBottom: '24px' }}>
                <div ref={chartContainerRef} style={{ width: '100%', height: '260px' }}>
                    {chartDims.width > 0 && (
                        <BarChart width={chartDims.width} height={chartDims.height} data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} />
                            <YAxis stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--glass-border)', color: 'white' }} />
                            <Legend />
                            <Bar dataKey="Projected" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Actual" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    )}
                </div>
            </Card>

            {/* Entry Form */}
            <Card title="Add Item" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <Input label="Category" placeholder="e.g. Venue, Staff" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
                    </div>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <Input label="Payee / Source (Optional)" placeholder="e.g. Convention Center" value={newItem.payee || ''} onChange={e => setNewItem({ ...newItem, payee: e.target.value })} />
                    </div>
                    <div style={{ width: '100px' }}>
                        <Input label="Amount ($)" type="number" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} />
                    </div>
                    <div style={{ width: '110px', marginBottom: '16px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Type</label>
                        <select
                            style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px' }}
                            value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}
                        >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                        </select>
                    </div>
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                        <Button variant="ghost" onClick={() => setShowCalc(!showCalc)} title="Variable Calculator">
                            <Calculator size={20} />
                        </Button>
                        <Button variant="outline" onClick={() => addEntry('projected')}>Add Projected</Button>
                        <Button variant="primary" onClick={() => addEntry('actual')}>Add Actual</Button>
                    </div>
                </div>
                {showCalc && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <Input label="Count" type="number" value={calcData.count} onChange={e => setCalcData({ ...calcData, count: e.target.value })} />
                            <Input label="Rate" type="number" value={calcData.rate} onChange={e => setCalcData({ ...calcData, rate: e.target.value })} />
                            <Input label="Hours" type="number" value={calcData.hours} onChange={e => setCalcData({ ...calcData, hours: e.target.value })} />
                            <Button style={{ marginBottom: '16px' }} onClick={addVariableExpense}>Use Total</Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Transaction List */}
            <Card title="Transactions">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '12px' }}>Category</th>
                                <th style={{ padding: '12px' }}>Payee</th>
                                <th style={{ padding: '12px' }}>Type</th>
                                <th style={{ padding: '12px' }}>Phase</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '12px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.length === 0 && (
                                <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No transactions recorded.</td></tr>
                            )}
                            {[...entries].reverse().map(entry => (
                                <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '12px' }}>{entry.category}</td>
                                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{entry.payee || '-'}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{
                                            color: entry.type === 'income' ? 'var(--success)' : 'var(--danger)',
                                            background: entry.type === 'income' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px'
                                        }}>
                                            {entry.type}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', textTransform: 'capitalize' }}>{entry.phase}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>${entry.amount.toLocaleString()}</td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                        <button
                                            onClick={() => deleteEntry(entry.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default AccountingPage;
