// Type declarations for ReactTooltip (web-only component)
// The implementation lives in ReactTooltip.web.tsx
import * as React from 'react';

export type ReactTooltipProps = {
  id: string;
  content: React.ReactNode;
  place?: 'top' | 'top-start' | 'top-end' | 'right' | 'right-start' | 'right-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end';
  noArrow?: boolean;
  theme?: 'dark' | 'light' | 'system';
  anchorSelect?: string;
  className?: string;
  noBorder?: boolean;
  showOnTouch?: boolean;
  touchTrigger?: 'click' | 'long-press';
  longPressDuration?: number;
  alwaysVisible?: boolean;
  autoHideAfter?: number;
  clickable?: boolean;
  variant?: 'simple' | 'rich';
};

export declare const ReactTooltip: React.FunctionComponent<ReactTooltipProps>;
export default ReactTooltip;
