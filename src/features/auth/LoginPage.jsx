import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Card from '../../components/ui/Card';
import { Lock } from 'lucide-react';

const LoginPage = () => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || '/admin';

    const handleLogin = (e) => {
        e.preventDefault();
        if (login(pin)) {
            navigate(from, { replace: true });
        } else {
            setError('Invalid PIN');
        }
    };

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-app)'
        }}>
            <Card style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
                <div style={{
                    width: '60px', height: '60px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                }}>
                    <Lock size={32} color="var(--primary)" />
                </div>
                <h1 className="text-gradient" style={{ marginBottom: '8px' }}>Admin Login</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Enter PIN to access event management</p>

                <form onSubmit={handleLogin} style={{ display: 'grid', gap: '16px' }}>
                    <Input
                        type="password"
                        placeholder="Enter PIN (1234)"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }}
                        autoFocus
                    />
                    {error && <div style={{ color: 'var(--danger)', fontSize: '14px' }}>{error}</div>}
                    <Button type="submit" variant="primary" size="lg">Unlock</Button>
                </form>
            </Card>
        </div>
    );
};

export default LoginPage;
