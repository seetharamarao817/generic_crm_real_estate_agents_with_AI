declare module 'react-joyride' {
  import * as React from 'react';
  
  export const STATUS: {
    FINISHED: string;
    SKIPPED: string;
    [key: string]: string;
  };

  export interface CallBackProps {
    action: string;
    index: number;
    lifecycle: string;
    step: any;
    status: string;
    type: string;
  }

  export interface Step {
    target: string | HTMLElement;
    content: React.ReactNode;
    placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end' | 'right' | 'right-start' | 'right-end' | 'auto' | 'center';
    disableBeacon?: boolean;
    styles?: any;
    title?: React.ReactNode;
  }

  export interface JoyrideProps {
    steps: Step[];
    run?: boolean;
    continuous?: boolean;
    scrollToFirstStep?: boolean;
    showProgress?: boolean;
    showSkipButton?: boolean;
    callback?: (data: CallBackProps) => void;
    styles?: any;
  }

  export default class Joyride extends React.Component<JoyrideProps> {}
}
