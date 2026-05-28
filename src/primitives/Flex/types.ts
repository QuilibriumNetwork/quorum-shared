import { ReactNode, CSSProperties } from 'react';

// ViewStyle type from react-native, used as a type-only reference for cross-platform style props
type ViewStyle = Record<string, unknown>;

export interface FlexProps {
  /**
   * Child elements
   */
  children: ReactNode;
  /**
   * Flex direction - 'row' (default) or 'column'
   */
  direction?: 'row' | 'column';
  /**
   * Main axis alignment (justify-content)
   */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  /**
   * Cross axis alignment (align-items)
   * Default depends on direction: 'center' for row, 'stretch' for column
   */
  align?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  /**
   * Gap between items (responsive values supported)
   */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number | string;
  /**
   * Whether items should wrap
   */
  wrap?: boolean;
  /**
   * Additional CSS classes (web only)
   */
  className?: string;
  /**
   * Inline styles - supports both web CSSProperties and React Native ViewStyle
   */
  style?: CSSProperties | ViewStyle | any;
  /**
   * Test ID for testing
   */
  testId?: string;
  /**
   * HTML attributes passthrough
   */
  [key: string]: any;
}
