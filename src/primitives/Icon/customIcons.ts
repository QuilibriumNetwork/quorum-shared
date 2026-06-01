/**
 * Custom SVG icons not available in the Tabler library.
 *
 * Each entry defines the SVG path data plus the viewBox it was authored against.
 * Icon.web renders these as inline <svg>; Icon.native renders them via
 * react-native-svg.
 *
 * To add a new custom icon:
 *   1. Add a key here with viewBox + path data
 *   2. Add the same key to IconName in types.ts
 *   3. Add the key in iconMapping.ts with value '__custom__'
 */

export interface CustomIconDef {
  viewBox: string;
  paths: Array<{ d: string; fill?: string; fillRule?: 'nonzero' | 'evenodd' }>;
}

export const customIcons: Record<string, CustomIconDef> = {
  farcaster: {
    viewBox: '0 0 32 32',
    paths: [
      {
        d: 'M5.507 0.072L26.097 0.072L26.097 4.167L31.952 4.167L30.725 8.263L29.686 8.263L29.686 24.833C30.207 24.833 30.63 25.249 30.63 25.763L30.63 26.88L30.819 26.88C31.341 26.88 31.764 27.297 31.764 27.811L31.764 28.928L21.185 28.928L21.185 27.811C21.185 27.297 21.608 26.88 22.13 26.88L22.319 26.88L22.319 25.763C22.319 25.316 22.639 24.943 23.065 24.853L23.045 15.71C22.711 12.057 19.596 9.194 15.802 9.194C12.008 9.194 8.893 12.057 8.559 15.71L8.539 24.845C9.043 24.919 9.663 25.302 9.663 25.763L9.663 26.88L9.852 26.88C10.373 26.88 10.796 27.297 10.796 27.811L10.796 28.928L0.218 28.928L0.218 27.811C0.218 27.297 0.641 26.88 1.162 26.88L1.351 26.88L1.351 25.763C1.351 25.249 1.774 24.833 2.296 24.833L2.296 8.263L1.257 8.263L0.029 4.167L5.507 4.167L5.507 0.072Z',
        fill: 'currentColor',
      },
    ],
  },
};

export function isCustomIcon(name: string): boolean {
  return name in customIcons;
}
