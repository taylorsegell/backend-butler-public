// Home Assistant's own custom elements, which the card renders inside HA's frontend.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type HaElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  [attribute: string]: unknown;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ha-card': HaElement;
      'ha-icon': HaElement;
    }
  }
}
