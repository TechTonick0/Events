import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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
            amount: parseFloat(newItem.amount),
            type: newItem.type,
            phase: phase
        };
        updateEventLedger([...entries, entry]);
        setNewItem({ ...newItem, amount: '', category: '' });
    };

    const addVariableExpense = () => {
        const total = (parseFloat(calcData.count) || 0) * (parseFloat(calcData.rate) || 0) * (parseFloat(calcData.hours) || 1);
        if (total > 0) {
            setNewItem({ ...newItem, amount: total.toString() });
            setShowCalc(false);
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

    const chartData = [
        { name: 'Income', Projected: stats.projected.income, Actual: stats.actual.income },
        { name: 'Expenses', Projected: stats.projected.expenses, Actual: stats.actual.expenses },
        { name: 'Profit', Projected: stats.projected.profit, Actual: stats.actual.profit },
    ];

    if (!event) return <div className="page-container" style={{ marginTop: '50px' }}>Loading...</div>;

    return (
        <div className="page-container" style={{ paddingBottom: '100px', marginTop: '50px' }}>
            <header style={{ marginBottom: '24px' }}>
                <h1 className="text-gradient" style={{ fontSize: '28px' }}>Financials</h1>
                <p style={{ color: 'var(--text-secondary)' }}>{event.name}</p>
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
                        <Input label="Category" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
                    </div>
                    <div style={{ width: '120px' }}>
                        <Input label="Amount ($)" type="number" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} />
                    </div>
                    <div style={{ width: '120px', marginBottom: '16px' }}>
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
        </div>
    );
};

export default AccountingPage;
