import { OverlayPanel } from './components/Overlay/OverlayPanel'
import { QuickCaptureBar } from './components/QuickCapture/QuickCaptureBar'

function App(): React.JSX.Element {
  const params = new URLSearchParams(window.location.search)
  const windowType = params.get('window')

  if (windowType === 'quickcapture') {
    return <QuickCaptureBar />
  }

  return <OverlayPanel />
}

export default App
