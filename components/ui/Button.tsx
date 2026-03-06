import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'default' | 'sm';
  icon?: LucideIcon;
  className?: string;
  type?: 'button' | 'submit';
}

export function Button({ 
  children, 
  onClick, 
  disabled, 
  variant = 'default', 
  size = 'default',
  icon: Icon,
  className = '',
  type = 'button'
}: ButtonProps) {
  const variantClass = variant === 'primary' ? 'btn-primary' : '';
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  
  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}
