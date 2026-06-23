import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Butler]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "system-ui,sans-serif", maxWidth: 560 }}>
          <h1 style={{ margin: "0 0 0.5rem" }}>Butler failed to load</h1>
          <p style={{ opacity: 0.85 }}>{this.state.error.message}</p>
          <p style={{ opacity: 0.65, fontSize: "0.9rem" }}>
            Hard-refresh the page (<kbd>Ctrl+Shift+R</kbd>). Ensure{" "}
            <code>npm run dev:api</code> and <code>npm run dev:web</code> are running.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
