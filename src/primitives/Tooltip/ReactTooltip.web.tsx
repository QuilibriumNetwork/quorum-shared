/**
 * ReactTooltip wrapper for react-tooltip library.
 *
 * This component wraps the react-tooltip Tooltip with:
 * - Theme-aware styling (dark/light)
 * - Touch device support (click/long-press to open, outside tap to dismiss)
 * - Portal rendering to escape stacking contexts
 * - Auto-hide after timeout
 * - Rich content support (variant="rich")
 *
 * Peer dependency: react-tooltip (>= 5.x)
 *
 * NOTE: The consuming app must import react-tooltip CSS and provide
 * the tooltip theme classes (quorum-react-tooltip, quorum-react-tooltip-dark).
 * Import 'react-tooltip/dist/react-tooltip.css' in your app entry point.
 */
import * as React from 'react';
import { Tooltip } from 'react-tooltip';

import { useTheme } from '../theme';
import { Portal } from '../Portal';

/** Detect if the current device supports touch input */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  );
}

export type ReactTooltipProps = {
  id: string;
  content: React.ReactNode;
  place?:
    | 'top'
    | 'top-start'
    | 'top-end'
    | 'right'
    | 'right-start'
    | 'right-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end'
    | 'left'
    | 'left-start'
    | 'left-end';
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

const ReactTooltip: React.FunctionComponent<ReactTooltipProps> = ({
  id,
  content,
  place = 'top',
  noArrow = false,
  className = '',
  theme,
  anchorSelect,
  noBorder = false,
  showOnTouch = false,
  touchTrigger = 'click',
  longPressDuration = 700,
  alwaysVisible = false,
  autoHideAfter,
  clickable = false,
  variant = 'simple',
}) => {
  const { resolvedTheme } = useTheme();
  const resolvedThemeInUse = theme || resolvedTheme;
  const [visible, setVisible] = React.useState(false);
  const tooltipRef = React.useRef<HTMLElement | null>(null);

  const touchClass = showOnTouch ? 'quorum-react-tooltip-touch' : '';
  const variantClass = variant === 'rich' ? 'tooltip-rich' : '';
  const tooltipClassName = `${resolvedThemeInUse === 'dark' ? 'quorum-react-tooltip-dark' : 'quorum-react-tooltip'} ${touchClass} ${variantClass} ${className}`;

  // Handle opening/closing on touch devices
  React.useEffect(() => {
    if (!showOnTouch || !isTouchDevice() || !anchorSelect || alwaysVisible)
      return;

    const elem = document.querySelector(anchorSelect) as HTMLElement | null;
    if (!elem) return;
    tooltipRef.current = elem;
    let pressTimer: NodeJS.Timeout | null = null;

    const openTooltip = () => {
      setVisible(true);
    };

    if (touchTrigger === 'click') {
      const handleTouch = () => {
        openTooltip();
      };
      elem.addEventListener('touchend', handleTouch, { passive: false });
      elem.addEventListener('click', openTooltip);

      return () => {
        elem.removeEventListener('touchend', handleTouch);
        elem.removeEventListener('click', openTooltip);
      };
    }

    if (touchTrigger === 'long-press') {
      const handleTouchStart = () => {
        pressTimer = setTimeout(() => openTooltip(), longPressDuration);
      };
      const handleTouchEnd = () => {
        if (pressTimer) clearTimeout(pressTimer);
      };
      elem.addEventListener('touchstart', handleTouchStart);
      elem.addEventListener('touchend', handleTouchEnd);
      elem.addEventListener('touchcancel', handleTouchEnd);
      elem.addEventListener('click', openTooltip);

      return () => {
        elem.removeEventListener('touchstart', handleTouchStart);
        elem.removeEventListener('touchend', handleTouchEnd);
        elem.removeEventListener('touchcancel', handleTouchEnd);
        elem.removeEventListener('click', openTooltip);
      };
    }
  }, [showOnTouch, anchorSelect, touchTrigger, longPressDuration, alwaysVisible]);

  // Auto-hide after specified time on touch devices
  React.useEffect(() => {
    if (
      !showOnTouch ||
      !isTouchDevice() ||
      !visible ||
      alwaysVisible ||
      !autoHideAfter
    )
      return;

    const autoHideTimer = setTimeout(() => {
      setVisible(false);
    }, autoHideAfter);

    return () => {
      clearTimeout(autoHideTimer);
    };
  }, [visible, showOnTouch, alwaysVisible, autoHideAfter]);

  // Dismiss on outside tap/click
  React.useEffect(() => {
    if (!showOnTouch || !isTouchDevice() || !visible || alwaysVisible) return;

    const handleOutside = (e: Event) => {
      const elem = tooltipRef.current;
      if (!elem) return setVisible(false);
      if (!(e.target instanceof Node) || !elem.contains(e.target)) {
        setVisible(false);
      }
    };
    document.addEventListener('touchstart', handleOutside, true);
    document.addEventListener('mousedown', handleOutside, true);
    return () => {
      document.removeEventListener('touchstart', handleOutside, true);
      document.removeEventListener('mousedown', handleOutside, true);
    };
  }, [visible, showOnTouch, alwaysVisible]);

  // Hide by default on touch unless showOnTouch is set
  if (isTouchDevice() && !showOnTouch) {
    return null;
  }

  const isStringContent = typeof content === 'string';

  // On touch devices with showOnTouch, show controlled tooltip
  if (isTouchDevice() && showOnTouch) {
    return (
      <Portal>
        <Tooltip
          id={id}
          {...(isStringContent ? { content: content as string } : { render: () => <>{content}</> })}
          place={place}
          noArrow={noArrow}
          className={tooltipClassName}
          anchorSelect={anchorSelect}
          border={
            noBorder ? undefined : '1px solid var(--color-border-default)'
          }
          isOpen={alwaysVisible ? true : visible}
          positionStrategy="fixed"
        />
      </Portal>
    );
  }

  // Normal desktop/hover operation
  return (
    <Portal>
      <Tooltip
        id={id}
        {...(isStringContent ? { content: content as string } : { render: () => <>{content}</> })}
        place={place}
        noArrow={noArrow}
        className={tooltipClassName}
        anchorSelect={anchorSelect}
        border={
          noBorder ? undefined : '1px solid var(--color-border-default)'
        }
        positionStrategy="fixed"
        delayShow={50}
        clickable={clickable}
      />
    </Portal>
  );
};

export { ReactTooltip };
export default ReactTooltip;
