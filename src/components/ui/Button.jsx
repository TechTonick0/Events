import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const Button = ({
    children,
    variant = 'primary', // primary, ghost, danger, outline
    size = 'md', // sm, md, lg
    className,
    isLoading,
    disabled,
    icon: Icon,
    ...props
}) => {
    const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

    // We are using standard CSS/Modules, but for this component I will use inline styles/classes combination 
    // or just predefined classes in index.css. 
    // Actually, I defined vars in index.css, I should add utility classes there or use style objects.
    // To make it easy, I will add a <style> block or just rely on global classes if I had them.
    // BETTER APPROACH: Use module css or just style objects since I don't have tailwind. 
    // I previously said "Vanilla CSS (CSS Modules)". 
    // Let's create `src/components/ui/Button.module.css` for this.

    return (
        <button
            className={clsx('ui-btn', `variant-${variant}`, `size-${size}`, className)}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading && <Loader2 className="animate-spin" size={16} style={{ marginRight: '8px' }} />}
            {!isLoading && Icon && <Icon size={18} style={{ marginRight: '8px' }} />}
            {children}
        </button>
    );
};

export default Button;
