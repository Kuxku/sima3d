import React, { Component, type ReactNode } from 'react';

interface Props {
  featureName: string;
  fallback?: ReactNode;
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class FeatureBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn(`[FeatureBoundary] Error en feature "${this.props.featureName}":`, error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
