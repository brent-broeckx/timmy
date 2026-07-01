import { OverlayPanel } from './components/Overlay/OverlayPanel'
import { QuickCaptureBar } from './components/QuickCapture/QuickCaptureBar'
import { AnchorRoot } from './components/Anchor/AnchorRoot'

function App(): React.JSX.Element {
  const params = new URLSearchParams(window.location.search)
  const windowType = params.get('window')

  if (windowType === 'quickcapture') {
    return <QuickCaptureBar />
  }

  if (windowType === 'anchor') {
    return <AnchorRoot />
  }

  return <OverlayPanel />
}

export default App
