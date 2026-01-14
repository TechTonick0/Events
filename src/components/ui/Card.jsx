import React from 'react';
import clsx from 'clsx';

const Card = ({ children, className, title, action, style, ...props }) => {
    return (
        <div
            className={clsx('glass-panel', className)}
            style={{ padding: '20px', borderRadius: 'var(--radius-md)', ...style }}
            {...props}
        >
            {(title || action) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    {title && <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{title}</h3>}
                    {action && <div>{action}</div>}
                </div>
            )}
            {children}
        </div>
    );
};

export default Card;
