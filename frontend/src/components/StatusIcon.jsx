import React from 'react';
import Icon from './Icon';

/**
 * StatusIcon
 * variant: success | warning | error | info | time
 * size: number (px)
 */
const MAP = {
  success: { name: 'success', color: 'var(--status-success, #16a34a)' },
  warning: { name: 'warning', color: 'var(--status-warning, #d97706)' },
  error:   { name: 'error',   color: 'var(--status-error, #dc2626)' },
  info:    { name: 'info',    color: 'var(--status-info, #2563eb)' },
  time:    { name: 'clock',   color: 'var(--status-time, #475569)' },
};

export function StatusIcon({ variant='info', size=16, className='' }) {
  const entry = MAP[variant] || MAP.info;
  return <Icon name={entry.name} size={size} color={entry.color} className={`status-icon ${className}`.trim()} />;
}

export default StatusIcon;
