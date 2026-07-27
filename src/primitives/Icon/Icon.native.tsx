import { logger } from '../../utils';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as IconLibrary from '@tabler/icons-react-native';
import { IconNativeProps, IconSize } from './types';
import { iconComponentMap } from './iconMapping';
import { customIcons, isCustomIcon } from './customIcons';
import { useTheme } from '../theme';

// Convert semantic size to pixel size (same as web)
const getSizeValue = (size: IconSize): number => {
  if (typeof size === 'number') return size;

  const sizeMap = {
    xs: 12,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
    '4xl': 64,
    '5xl': 96,
  };

  return sizeMap[size] || 16;
};

export function Icon({
  name,
  size = 'md',
  color,
  className, // Ignored on native - for API consistency
  style = {},
  disabled = false,
  id, // Ignored on native - for API consistency
  onClick,
  variant = 'outline',
  colored = false,
}: IconNativeProps) {
  const theme = useTheme();
  const colors = theme.colors;

  const iconComponentName = iconComponentMap[name];

  if (!iconComponentName) {
    logger.warn(`Icon "${name}" not found in icon mapping`);
    return null;
  }

  if (isCustomIcon(name)) {
    const def = customIcons[name];
    const iconSize = getSizeValue(size);
    const iconColor = color || colors.text.main;
    const usePathFills = colored && def.colored;
    const combinedStyle = {
      ...(disabled && { opacity: 0.5 }),
      ...style,
    };

    const svg = (
      <Svg
        width={iconSize}
        height={iconSize}
        viewBox={def.viewBox}
        style={combinedStyle}
      >
        {def.paths.map((p, i) => (
          <Path
            key={i}
            d={p.d}
            fill={def.stroke ? 'none' : usePathFills ? p.fill : iconColor}
            fillRule={p.fillRule}
            stroke={def.stroke ? iconColor : undefined}
            strokeWidth={def.stroke ? (def.strokeWidth ?? 2) : undefined}
            strokeLinecap={def.stroke ? 'round' : undefined}
            strokeLinejoin={def.stroke ? 'round' : undefined}
          />
        ))}
      </Svg>
    );

    if (onClick && !disabled) {
      return (
        <TouchableOpacity onPress={onClick} activeOpacity={0.7}>
          {svg}
        </TouchableOpacity>
      );
    }
    return svg;
  }

  // Determine final component name based on variant
  const finalComponentName = variant === 'filled'
    ? `${iconComponentName}Filled`
    : iconComponentName;

  let IconComponent = (IconLibrary as any)[finalComponentName];

  if (!IconComponent) {
    // If filled variant doesn't exist, try falling back to outline
    if (variant === 'filled') {
      logger.warn(
        `Icon "${name}" does not have a filled variant. Falling back to outline.`
      );
      IconComponent = (IconLibrary as any)[iconComponentName];
      if (!IconComponent) {
        logger.warn(`Icon component "${iconComponentName}" not found in icon library`);
        return null;
      }
    } else {
      logger.warn(`Icon component "${finalComponentName}" not found in icon library`);
      return null;
    }
  }

  const iconSize = getSizeValue(size);
  const iconColor = color || colors.text.main;

  const combinedStyle = {
    ...(disabled && { opacity: 0.5 }),
    ...style,
  };

  const iconComponent = (
    <IconComponent
      size={iconSize}
      color={iconColor}
      style={combinedStyle}
    />
  );

  // If onClick is provided, wrap in TouchableOpacity
  if (onClick && !disabled) {
    return (
      <TouchableOpacity onPress={onClick} activeOpacity={0.7}>
        {iconComponent}
      </TouchableOpacity>
    );
  }

  return iconComponent;
}
