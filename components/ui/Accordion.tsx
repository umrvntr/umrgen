import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function Accordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span className="accordion-title">{title}</span>
        <ChevronDown size={14} className={`accordion-icon ${open ? 'open' : ''}`} />
      </div>
      {open && <div className="accordion-content">{children}</div>}
    </div>
  );
}
