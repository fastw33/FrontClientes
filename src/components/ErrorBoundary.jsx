import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-state">
          <img src={import.meta.env.VITE_FASTWAY_LOGO_URL} alt="Fastway" width="200" />
          <h1>No pudimos cargar tu espacio</h1>
          <p>Vuelve a cargar el portal para intentarlo nuevamente.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            Volver a cargar
          </button>
        </main>
      )
    return this.props.children
  }
}
