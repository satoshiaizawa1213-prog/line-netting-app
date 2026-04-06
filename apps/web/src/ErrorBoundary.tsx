import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, color: '#E53935' }}>
          <strong>エラーが発生しました</strong>
          <pre style={{ fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
