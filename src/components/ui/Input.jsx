import React from 'react';

const Input = ({ label, error, ...props }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {label && <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>}
            <input
                style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: error ? '1px solid var(--danger)' : '1px solid var(--glass-border)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    width: '100%'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = error ? 'var(--danger)' : 'var(--glass-border)'}
                {...props}
            />
            {error && <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</span>}
        </div>
    );
};

export default Input;
