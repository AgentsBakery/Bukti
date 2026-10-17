import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import { KawungLoader } from './components/Kawung'
import { SvgDefs } from './components/SvgDefs'
import { Tooltip } from 'radix-ui'

const Landing = lazy(() => import('./landing/Landing'))
const BorrowerApp = lazy(() => import('./borrower/BorrowerApp'))
const ConsolePage = lazy(() => import('./console/ConsolePage'))
const DemoPage = lazy(() => import('./demo/DemoPage'))

function BorrowerRoute() {
  const { appId } = useParams()
  return (
    <div className="flex h-dvh justify-center bg-paper-2">
      <div className="h-full w-full max-w-[520px] shadow-[0_0_0_1px_rgb(43_38_32/0.08),0_30px_80px_-40px_rgb(60_40_10/0.5)]">
        <BorrowerApp appId={appId!} />
      </div>
    </div>
  )
}

function Fallback() {
  return (
    <div className="grid h-dvh place-items-center bg-paper">
      <KawungLoader size={44} />
    </div>
  )
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={250}>
        <SvgDefs />
        <BrowserRouter>
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/apply/:appId" element={<BorrowerRoute />} />
              <Route path="/console" element={<ConsolePage />} />
              <Route path="/console/:appId" element={<ConsolePage />} />
              <Route path="/demo/:appId" element={<DemoPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </Tooltip.Provider>
    </MotionConfig>
  )
}
